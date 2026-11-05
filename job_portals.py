"""Public job feeds for JavaScript career portals. No login or challenge bypass."""
import json
import re
from html import unescape
from urllib.parse import parse_qs, urlsplit, urljoin
from lxml import html
from job_page import plain

# Verified custom domains whose public Greenhouse board has a different name.
GREENHOUSE_BOARDS = {'careers.toasttab.com': 'toast'}


def description(value):
    if not isinstance(value, str) or not value.strip():
        return ''
    root = html.fragment_fromstring(unescape(value), create_parent='div')
    for element in root.xpath('.//script|.//style'):
        element.drop_tree()
    return plain(root)


def result(title, company, parts):
    text = '\n\n'.join(dict.fromkeys(description(p) for p in parts if p))
    if not text.strip():
        raise ValueError('The portal returned no active job description. The posting may have closed. Paste the description if you still have it.')
    return dict(title=title or '', company=company or '', jd=text)


def portal_posting(link, fetch):
    u = urlsplit(link)
    if u.scheme not in ('http', 'https') or u.username or u.password or u.port not in (None, 80, 443):
        return None
    host, path = u.hostname or '', u.path.strip('/')
    query = parse_qs(u.query)
    if host.endswith('.oraclecloud.com'):
        route = path + ('/' + u.fragment.lstrip('/') if u.fragment else '')
        match = re.fullmatch(r'hcmUI/CandidateExperience/[^/]+/sites/([\w-]+)/(?:job|requisitions)/(\d+)(?:/.*)?', route)
        if match:
            site, key = match.groups()
            data = json.loads(fetch(f'https://{host}/hcmRestApi/resources/latest/recruitingCEJobRequisitionDetails?onlyData=true&finder=ById;Id={key},siteNumber={site}'))
            jobs = [j for j in data.get('items', []) if str(j.get('Id')) == key]
            if len(jobs) != 1:
                raise ValueError('This Oracle job is unavailable or no longer published. Check the link or paste its description.')
            j = jobs[0]
            company = j.get('LegalEmployer') or j.get('Organization') or ''
            if not company:
                # The tenant name is often opaque; use the public site's brand metadata.
                try:
                    root = html.fromstring(fetch(u._replace(scheme='https').geturl()))
                    company = root.xpath('string(//meta[@property="og:site_name"]/@content)').strip()
                    company = re.sub(r'\s+Candidate Experience.*$', '', company, flags=re.I)
                except (ValueError, OSError):
                    pass
            return result(j.get('Title'), company, [j.get(k) for k in ('ExternalDescriptionStr', 'ExternalResponsibilitiesStr', 'ExternalQualificationsStr')])
    board = GREENHOUSE_BOARDS.get(host)
    key = query.get('gh_jid', [''])[0]
    if board and key.isdigit():
        j = json.loads(fetch(f'https://boards-api.greenhouse.io/v1/boards/{board}/jobs/{key}'))
        if str(j.get('id')) != key:
            raise ValueError('The underlying posting does not match this job link.')
        return result(j.get('title'), j.get('company_name') or board, [j.get('content')])
    if host == 'jobs.smartrecruiters.com':
        match = re.fullmatch(r'([\w-]+)/(\d+)(?:-[^/]*)?/?', path)
        if match:
            org, key = match.groups()
            j = json.loads(fetch(f'https://api.smartrecruiters.com/v1/companies/{org}/postings/{key}'))
            sections = j.get('jobAd', {}).get('sections', {})
            return result(j.get('name'), j.get('company', {}).get('name') or org,
                          [sections.get(k, {}).get('text') for k in ('jobDescription', 'qualifications', 'additionalInformation')])
    if host == 'jobs.ashbyhq.com':
        match = re.fullmatch(r'([\w-]+)/([a-fA-F0-9-]{36})(?:/application)?', path)
        if match:
            org, key = match.groups()
            data = json.loads(fetch(f'https://api.ashbyhq.com/posting-api/job-board/{org}'))
            jobs = [j for j in data.get('jobs', []) if j.get('id') == key and j.get('isListed', True)]
            if len(jobs) != 1:
                raise ValueError('This Ashby job is no longer listed publicly. Check the link or paste its description.')
            return result(jobs[0].get('title'), org, [jobs[0].get('descriptionHtml') or jobs[0].get('descriptionPlain')])
    if re.fullmatch(r'[\w-]+\.recruitee\.com', host):
        match = re.fullmatch(r'(?:[a-z]{2}/)?o/([\w-]+)', path)
        if match:
            j = json.loads(fetch(f'https://{host}/api/offers/{match[1]}')).get('offer', {})
            return result(j.get('title'), host.split('.')[0], [j.get('description'), j.get('requirements')])
    return None


def embedded_links(body, link):
    """Follow only explicit supported ATS links, never arbitrary script URLs."""
    root = html.fromstring(body)
    known = {'boards.greenhouse.io', 'job-boards.greenhouse.io', 'jobs.lever.co', 'jobs.eu.lever.co', 'jobs.ashbyhq.com', 'jobs.smartrecruiters.com'}
    matches = []
    for raw in root.xpath('//iframe/@src|//a/@href|//link[@rel="canonical"]/@href'):
        target = urljoin(link, raw)
        u = urlsplit(target)
        if u.scheme == 'https' and u.hostname in known and not u.username and not u.password:
            if u.hostname in ('boards.greenhouse.io', 'job-boards.greenhouse.io') and u.path.rstrip('/') == '/embed/job_app':
                query = parse_qs(u.query)
                org, key = query.get('for', [''])[0], query.get('token', [''])[0]
                if re.fullmatch(r'[\w-]+', org) and key.isdigit():
                    target = f'https://boards.greenhouse.io/{org}/jobs/{key}'
            if target not in matches:
                matches.append(target)
    return matches
