import json
import unittest
from unittest.mock import patch

import formats
import job_page


class PostingImport(unittest.TestCase):
    url = 'https://cliftonlarsonallen.wd115.myworkdayjobs.com/en-US/cla/job/Austin-TX/Backend-Software-Engineer-II_R18338'

    def test_workday_localized_and_unlocalized(self):
        payload = json.dumps({'jobPostingInfo': {'title': 'Backend Engineer', 'jobDescription': '<h2>Requirements</h2><ul><li>Python &amp; SQL</li><li>Databricks</li></ul>'},
                              'hiringOrganization': {'name': 'CliftonLarsonAllen LLP'}}).encode()
        for url in (self.url, self.url.replace('/en-US', '') + '?source=LinkedIn'):
            with patch('formats.fetch_page', return_value=payload) as fetch:
                result = formats.posting(url)
            self.assertEqual(result['company'], 'CliftonLarsonAllen LLP')
            self.assertEqual(result['jd'], 'Requirements\nPython & SQL\nDatabricks')
            self.assertEqual(fetch.call_args.args[0], 'https://cliftonlarsonallen.wd115.myworkdayjobs.com/wday/cxs/cliftonlarsonallen/cla/job/Austin-TX/Backend-Software-Engineer-II_R18338')

    def test_workday_expired_or_board_has_clear_error(self):
        with patch('formats.fetch_page', return_value=b'{}'):
            with self.assertRaisesRegex(ValueError, 'active job description'):
                formats.posting(self.url)
        with self.assertRaisesRegex(ValueError, 'individual Workday'):
            formats.posting('https://cliftonlarsonallen.wd115.myworkdayjobs.com/en-US/cla')

    def test_lookalike_host_not_treated_as_workday(self):
        with patch('formats.fetch_page', return_value=b'<html/>') as fetch, patch('formats.parse_page', return_value={'jd': 'test'}):
            formats.fetch_posting(self.url.replace('.com/', '.com.example.org/'))
            self.assertNotIn('/wday/cxs/', fetch.call_args.args[0])

    def test_existing_structured_html(self):
        body = b'<script type="application/ld+json">{"@graph":[{"@type":"JobPosting","title":"Engineer","description":"<p>Build APIs.</p>","hiringOrganization":{"name":"Acme"}}]}</script>'
        self.assertEqual(job_page.parse_page(body), {'title': 'Engineer', 'company': 'Acme', 'jd': 'Build APIs.'})

    def test_private_destinations_stay_blocked(self):
        with patch('job_page.socket.getaddrinfo', return_value=[(2, 1, 6, '', ('127.0.0.1', 443))]):
            with self.assertRaisesRegex(ValueError, 'public posting'):
                job_page.fetch_page('https://example.org/job')


class LegacyLayout(unittest.TestCase):
    def test_header_role_and_project_structure(self):
        import layout
        result = layout.plan([['name', 'JANE DOE Seattle, WA | jane@example.com'],
                              ['section', 'Experience'], ['text', 'Acme / Seattle, WA'],
                              ['role', 'Software Engineer / Jan 2024 – Present'],
                              ['section', 'Projects'], ['role', 'Ledger'],
                              ['text', 'Built a service using'], ['text', 'Python.']])
        self.assertEqual([r['kind'] for r in result], ['name', 'contact', 'section', 'entry', 'section', 'entry', 'bullet'])
        self.assertEqual(''.join(t for t, _, _ in result[3]['runs']), 'Software Engineer, Acme')
        self.assertEqual(result[3]['right'], 'Jan 2024 – Present | Seattle, WA')
        self.assertEqual(result[-1]['rows'], [6, 7])


if __name__ == '__main__':
    unittest.main()

class PublicPortalImport(unittest.TestCase):
    def test_oracle_exact_requisition(self):
        body = json.dumps({'items': [{'Id': '26471', 'Title': 'Software Engineer III', 'LegalEmployer': 'Pearson', 'ExternalDescriptionStr': '<p>Build services.</p>'}]}).encode()
        with patch('formats.fetch_page', return_value=body) as fetch:
            result = formats.posting('https://hccz.fa.em3.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_2/job/26471')
        self.assertEqual(result['jd'], 'Build services.')
        self.assertIn('recruitingCEJobRequisitionDetails', fetch.call_args.args[0])

    def test_oracle_wrong_requisition_rejected(self):
        with patch('formats.fetch_page', return_value=b'{"items":[{"Id":"123"}]}'):
            with self.assertRaisesRegex(ValueError, 'unavailable'):
                formats.posting('https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/210806754')

    def test_toast_uses_exact_public_greenhouse_job(self):
        with patch('formats.fetch_page', return_value=b'{"id":8334794,"title":"Backend Engineer","content":"&lt;p&gt;Build APIs.&lt;/p&gt;"}') as fetch:
            result = formats.posting('https://careers.toasttab.com/jobs/backend?gh_jid=8334794')
        self.assertEqual(result['jd'], 'Build APIs.')
        self.assertEqual(fetch.call_args.args[0], 'https://boards-api.greenhouse.io/v1/boards/toast/jobs/8334794')

    def test_ashby_selects_only_requested_job(self):
        key = '11111111-1111-1111-1111-111111111111'
        body = json.dumps({'jobs': [{'id':'other', 'descriptionPlain':'Wrong'}, {'id':key, 'title':'Engineer', 'descriptionPlain':'Correct'}]}).encode()
        with patch('formats.fetch_page', return_value=body):
            self.assertEqual(formats.posting(f'https://jobs.ashbyhq.com/acme/{key}')['jd'], 'Correct')

    def test_smartrecruiters_sections(self):
        body = json.dumps({'name':'Engineer', 'jobAd':{'sections':{'jobDescription':{'text':'Build'}, 'qualifications':{'text':'Python'}}}}).encode()
        with patch('formats.fetch_page', return_value=body):
            self.assertEqual(formats.posting('https://jobs.smartrecruiters.com/acme/123-engineer')['jd'], 'Build\n\nPython')

    def test_recruitee_description_and_requirements(self):
        body = b'{"offer":{"title":"Engineer","description":"Build","requirements":"Python"}}'
        with patch('formats.fetch_page', return_value=body):
            self.assertEqual(formats.posting('https://acme.recruitee.com/o/engineer')['jd'], 'Build\n\nPython')

class HeaderContactRegression(unittest.TestCase):
    def test_contact_after_tagline_is_centered_and_linked(self):
        import layout
        import pdfdoc
        rows = [['name','Jane Doe'], ['contact','SOFTWARE ENGINEER | BACKEND'],
                ['text','Seattle, WA | 555-010-1234 | jane@example.com | GitHub'],
                ['links','GitHub https://github.com/jane'], ['section','Summary'], ['text','Builds APIs.']]
        items = layout.plan(rows)
        contact = items[2]
        self.assertEqual(contact['kind'], 'contact')
        self.assertEqual(pdfdoc.style(contact['kind'],8.55).alignment,1)
        self.assertIn('https://github.com/jane',[u for _,u,_ in contact['runs']])
        self.assertEqual(items[-1]['kind'],'summary')
