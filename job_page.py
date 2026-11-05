import http.client
import ipaddress
import json
import re
import socket
from urllib.parse import quote, urljoin, urlsplit

from lxml import html


def fetch_page(link):
    for _ in range(6):
        url = urlsplit(link)
        if url.scheme not in ('http', 'https') or not url.hostname or url.username or url.password:
            raise ValueError('Enter a public HTTP or HTTPS posting URL.')
        secure = url.scheme == 'https'
        port = url.port or (443 if secure else 80)
        host = url.hostname.encode('idna').decode()
        addresses = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
        if any(not ipaddress.ip_address(a[4][0]).is_global or ipaddress.ip_address(a[4][0]).is_multicast for a in addresses):
            raise ValueError('Use a public posting URL.')
        # Connect to the validated address while preserving Host and TLS hostname verification.
        conn = (http.client.HTTPSConnection if secure else http.client.HTTPConnection)(host, port, timeout=9)
        conn._create_connection = lambda address, timeout, source: socket.create_connection((addresses[0][4][0], port), timeout, source)
        try:
            path = quote(url.path or '/', safe="/%:@!$&'()*+,;=-._~")
            query = quote(url.query, safe="=&%/:?@!$'()*+,;~-._")
            conn.request('GET', path + ('?' + query if query else ''), headers={'User-Agent':'Mozilla/5.0 (compatible; RoleFolio/1.0)', 'Accept':'text/html,application/json'})
            response = conn.getresponse()
            if response.status in (301,302,303,307,308) and response.getheader('Location'):
                link = urljoin(link, response.getheader('Location'))
                continue
            if response.status != 200:
                if response.status == 202:
                    raise ValueError('The posting site returned an intermediate response (HTTP 202), possibly a browser verification page. Use the direct public ATS job link or paste the description.')
                if response.status in (401, 403):
                    raise ValueError('The posting site denied automated access or requires sign-in. Paste the job description to continue.')
                if response.status in (404, 410):
                    raise ValueError('This posting was not found or has closed. Check the individual job URL or paste its description.')
                raise ValueError(f'The posting site returned HTTP {response.status}. Paste the job description to continue.')
            body = response.read(4000001)
            if len(body) > 4000000:
                raise ValueError('The posting page is too large. Paste its description instead.')
            return body
        finally:
            conn.close()
    raise ValueError('The posting redirected too many times.')


def plain(node):
    parts = []
    for element in node.iter():
        if element.tag in ('p','div','li','br','h1','h2','h3','section','ul'):
            if element.text:
                element.text = '\n' + element.text
            element.tail = '\n' + (element.tail or '')
    for line in node.text_content().splitlines():
        text = ' '.join(line.split())
        if text:
            parts.append(text)
    return '\n'.join(parts)


def job_nodes(value):
    if isinstance(value, list):
        for item in value:
            yield from job_nodes(item)
    elif isinstance(value, dict):
        types = value.get('@type', [])
        if 'JobPosting' in ([types] if isinstance(types, str) else types or []):
            yield value
        for item in value.values():
            yield from job_nodes(item)


def parse_page(body):
    root = html.fromstring(body)
    for raw in root.xpath('//script[contains(@type,"ld+json")]/text()'):
        try:
            jobs = list(job_nodes(json.loads(raw)))
        except (ValueError, TypeError):
            continue
        if len(jobs) > 1:
            raise ValueError('This page lists multiple jobs. Open an individual posting and import its link.')
        if jobs and isinstance(jobs[0].get('description'), str) and jobs[0]['description'].strip():
            job = jobs[0]
            org = job.get('hiringOrganization') or {}
            return dict(title=job.get('title') or '', company=org.get('name','') if isinstance(org,dict) else '', jd=plain(html.fragment_fromstring(job['description'],create_parent='div')))
    title = (root.xpath('string((//*[@itemprop="title"])[1])').strip()
             or root.xpath('string(//meta[@property="og:title"]/@content)').strip()
             or root.xpath('string((//h1[normalize-space()])[1])').strip()
             or root.xpath('string(//title)').strip())
    company = (root.xpath('string(//*[@itemprop="hiringOrganization"]//*[@itemprop="name"]/@content)').strip()
               or root.xpath('string(//*[@itemprop="hiringOrganization"]//*[@itemprop="name"])').strip()
               or root.xpath('string(//meta[@property="og:site_name"]/@content)').strip())
    for element in root.xpath('//script|//style|//nav|//footer|//noscript|//form|//aside'):
        element.drop_tree()
    nodes = root.xpath('//*[@itemprop="description" or @id="job-description" or contains(@class,"job-description")]') or root.xpath('//article|//main|//*[@role="main"]') or [root]
    for node in nodes:
        text = plain(node)
        if len(text)>120 and re.search(r'responsibilit|qualifications|requirements|you will|you.ll|about the role|experience|what we.offer', text, re.I):
            return dict(title=title,company=company,jd=text)
    raise ValueError('No readable job description was found. The page may require sign-in or JavaScript. Paste the posting text to continue.')
