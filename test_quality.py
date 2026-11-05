import copy
import unittest
from unittest.mock import patch

import engine
from test_engine import RESUME, REQS, JD, out


class QualityPipeline(unittest.TestCase):
    def setUp(self):
        self.rows = engine.structure(RESUME)
        self.draft = out(title='Backend Engineer', summary=(
            'Backend Engineer building payment systems. Works with Python, Kafka and PostgreSQL. '
            'Builds pipelines processing 2M events per day. Mentors junior engineers through code reviews.'))
        self.usage = dict(model='test', input=10, output=20, cache_read=0, cache_write=0, cost=0.01)
        self.plan = dict(
            narrative='Lead with Python pipeline reliability.',
            blueprint=dict(specialization='Backend engineering', p0_requirements=['q1'], p1_requirements=['q2'],
                           p2_requirements=['q3'], p3_requirements=[], architectural_themes=['Event-driven services'],
                           expected_ownership='Component ownership', seniority='Mid-level', mandatory_constraints=[],
                           operational_metrics=['Latency'], project_evidence=['Reliability testing']),
            candidate_timeline=[], priorities=['q1'], bullets=[], matrix=[])
        self.recruiter_review = dict(issues=[], visual_issues=[], recruiter_quality=88, visual_quality=90)

    def run_pipeline(self, responses, level='medium'):
        for response in responses:
            if 'issues' in response and 'visual_issues' not in response:
                response.setdefault('coverage', [dict(requirement=q['id'], status='covered' if level == 'aggressive' or q['status'] != 'unsupported' else 'missing', rows=['r9'], reason='Test evidence') for q in REQS])
                if level == 'aggressive':
                    response.setdefault('technical_quality', 85)
                    response.setdefault('findings', [dict(severity='blocking', detail=i) for i in response['issues']])
                    response.setdefault('alignment', dict(initial_rubric=dict(critical=15, experience=15, responsibilities=10, preferred=5, projects=5, formatting=5), rationale='Stronger final evidence',
                                                          rubric=dict(critical=25, experience=20, responsibilities=15, preferred=8, projects=8, formatting=5)))
        with patch.object(engine, 'claude', side_effect=[(copy.deepcopy(r), self.usage) for r in responses]) as model:
            result = engine.tailor({'api_key': 'test'}, self.rows, JD, {'requirements': REQS}, level, 'Backend Engineer')
        return result, model

    def test_clean_draft_audits_fitted_output_and_preserves_evidence(self):
        result, model = self.run_pipeline([self.draft, {'issues': []}])
        self.assertEqual(model.call_count, 2)
        self.assertIn('"evidence":["r9"]', model.call_args_list[0].args[2])
        self.assertIn('final_rows', model.call_args_list[1].args[2])
        self.assertEqual(model.call_args_list[1].args[3]['properties']['coverage']['items']['properties']['requirement']['enum'], ['q1', 'q2', 'q3'])
        self.assertEqual(result['quality']['status'], 'passed')
        self.assertEqual(result['usage']['cost'], 0.02)
        self.assertIsNotNone(result['fit']['size'])

    def test_revision_bounded_and_unresolved_issues_visible(self):
        result, model = self.run_pipeline([self.draft, {'issues': ['Rewrite vague bullet r9.']},
                                           self.draft, {'issues': ['Confirm scope on r9.']}])
        self.assertEqual(model.call_count, 4)
        self.assertIn('Rewrite vague bullet r9.', model.call_args_list[2].args[2])
        self.assertEqual(result['quality']['status'], 'needs_review')
        self.assertIn('Confirm scope on r9.', result['verification'])
        self.assertEqual(result['usage']['cost'], 0.04)
        self.assertEqual(result['usage']['output'], 80)

    def test_bad_summary_triggers_revision_even_if_model_audit_misses_it(self):
        bad = dict(self.draft, summary='Backend Engineer building systems.')
        result, model = self.run_pipeline([bad, {'issues': []}, self.draft, {'issues': []}])
        self.assertEqual(model.call_count, 4)
        self.assertTrue(result['quality']['revised'])
        self.assertEqual(result['quality']['status'], 'passed')

    def test_basic_does_not_require_four_sentence_summary(self):
        result, model = self.run_pipeline([out(title='Backend Engineer'), {'issues': []}], 'basic')
        self.assertEqual(model.call_count, 2)
        self.assertEqual(result['quality']['status'], 'passed')

    def test_metric_cannot_be_borrowed_from_another_bullet(self):
        bullet = next(r for r in self.rows if r['text'].startswith('Built'))
        result = engine.build(self.rows, out(edits=[dict(id=bullet['id'], text='Built a Kafka pipeline improving latency by 35%.',
                                                       reason='', requirements=[])]), 'medium', REQS)
        guarded = next(r for r in result['rows'] if r['id'] == bullet['id'])
        self.assertEqual(guarded['after'], bullet['text'])
        self.assertIn('35%', guarded['flag'])

    def test_skill_and_full_quality_standard_are_in_runtime_prompt(self):
        prompt = engine.system_prompt()
        self.assertIn('Every statement is something the candidate can explain honestly in an interview.', prompt)
        self.assertIn('Target 25–40 skills only when enough relevant, supported skills exist', prompt)

    def test_final_audit_failure_is_not_reported_as_success(self):
        with patch.object(engine, 'claude', side_effect=[(self.draft, self.usage), ValueError('API unavailable')]):
            with self.assertRaisesRegex(ValueError, 'API unavailable'):
                engine.tailor({'api_key': 'test'}, self.rows, JD, {'requirements': REQS}, 'medium', 'Backend Engineer')

    def test_offline_does_not_claim_model_review(self):
        with patch.object(engine, 'claude') as model:
            result = engine.tailor({'model': 'offline'}, self.rows, JD, {'requirements': REQS}, 'medium', 'Backend Engineer')
        model.assert_not_called()
        self.assertNotIn('quality', result)
        self.assertTrue(any('audit was not run' in s for s in result['verification']))

    def aggressive_draft(self, **kw):
        return out(title='Backend Engineer', summary=(
            'Backend Engineer with five years delivering dependable payment platforms and production services. '
            'Specializes in distributed backend design, resilient deployments, automated quality controls, and incident resolution. '
            'Owns implementation through release while partnering on design reviews and operational decisions.'
        ), **kw)

    def test_summary_rejects_skill_inventory_repetition_and_inline_disclosure(self):
        from tailoring_quality import summary_issues
        rows = [dict(kind='text', section='Summary', after='Backend Engineer using Java, Python, AWS, Kubernetes, SQL and Kafka.'),
                dict(kind='text', section='Skills', after='Languages: Java, Python, SQL\nCloud: AWS, Kubernetes, Kafka')]
        self.assertTrue(any('skills inventory' in issue for issue in summary_issues(rows)))
        rows[0]['after'] = 'SYNTHETIC SAMPLE — NOT FOR SUBMISSION. Backend Engineer owning production delivery.'
        self.assertTrue(any('disclosure' in issue for issue in summary_issues(rows)))

    def test_engineering_scenario_is_required_before_generated_bullets(self):
        from tailoring_quality import engineering_issues
        rows = [dict(id='r1', kind='bullet', section='Professional Experience', before='Built an API.', after='Built and deployed an API.')]
        self.assertIn('evidence ledger', engineering_issues(rows, [])[0])
        record = dict(row_id='r1', requirement_ids=['q1'], problem='Slow releases.', environment='Service architecture.',
                      responsibility='Own implementation.', implementation='Add automated deployment.', validation='Deployment metrics.', outcome='Faster releases.')
        self.assertEqual(engineering_issues(rows, [record]), [])

    def test_metric_percentage_calculation_is_checked(self):
        from tailoring_quality import metric_issues
        correct = dict(target='r1', metric_basis='Baseline: 200 ms; result: 150 ms; improvement: 25%.')
        incorrect = dict(target='r1', metric_basis='Baseline: 200 ms; result: 150 ms; improvement: 30%.')
        self.assertEqual(metric_issues([correct]), [])
        self.assertIn('25.0%, not 30%', metric_issues([incorrect])[0])
        structured = dict(target='r2', metric_basis='Latency reduced by 25%.', metric=dict(
            name='p95 latency', baseline='200 ms', final='150 ms', unit='ms', period='Weekly load test',
            calculation='(200 - 150) / 200 * 100 = 25%', validation='Representative load test',
            causality='Indexing reduced query execution time.'))
        self.assertEqual(metric_issues([structured]), [])
        structured['metric']['calculation'] = '(200 - 150) / 200 * 100 = 30%'
        self.assertIn('25.0%, not 30%', metric_issues([structured])[0])

    def test_aggressive_plans_before_drafting_and_reports_jd_coverage(self):
        result, model = self.run_pipeline([self.plan, self.aggressive_draft(), {'issues': []}, self.recruiter_review], 'aggressive')
        self.assertEqual(model.call_count, 4)
        self.assertIn('Lead with Python pipeline reliability.', model.call_args_list[1].args[2])
        self.assertIn('blueprint', model.call_args_list[0].args[2])
        self.assertNotIn('\"status\": \"unsupported\"', model.call_args_list[0].args[2])
        self.assertNotIn('\"status\":\"unsupported\"', model.call_args_list[1].args[2])
        self.assertTrue(model.call_args_list[0].kwargs['generative'])
        self.assertTrue(model.call_args_list[-1].kwargs['generative'])
        self.assertTrue(model.call_args_list[-1].kwargs['image'])
        self.assertEqual(result['strategy'], self.plan['narrative'])
        self.assertEqual(result['usage']['cost'], .04)
        self.assertTrue(result['generative'])
        self.assertTrue(any(m['requirement'] == 'q2' for m in result['missing']))
        self.assertEqual(result['coverage']['score'], 100)
        self.assertEqual(result['alignment']['final'], 81)
        self.assertEqual(result['technical_quality'], 85)
        self.assertEqual(result['recruiter_quality'], 88)
        self.assertTrue(result['document_qa']['visual_inspection'])
        self.assertIn('exportApproval', result)

    def test_clean_revision_beats_higher_coverage_with_engineering_failures(self):
        full = [dict(requirement=q['id'], status='covered', rows=['r9'], reason='Covered') for q in REQS]
        with patch.object(engine, 'evaluate', side_effect=[
                (['Invalid engineering causality.'], self.usage), ([], self.usage)]) as evaluate:
            def fitted(result, *args):
                result['fit'] = dict(size=8.55, log=[])
                result['coverage'] = dict(score=100 if evaluate.call_count == 0 else 90, complete=True, requirements=full)
                return result
            with patch.object(engine, 'fit_result', side_effect=fitted), patch.object(engine, 'claude', side_effect=[
                    (self.plan, self.usage), (self.aggressive_draft(), self.usage), (self.aggressive_draft(), self.usage)]):
                result = engine.tailor({'api_key':'test'}, self.rows, JD, {'requirements':REQS}, 'aggressive', 'Backend Engineer')
        self.assertEqual(result['coverage']['score'], 90)
        self.assertEqual(result['quality']['status'], 'passed')

    def test_invalid_initial_rubric_is_rejected(self):
        invalid = dict(initial_rubric=dict(critical=31, experience=10, responsibilities=10, preferred=5, projects=5, formatting=5),
                       rubric=dict(critical=25, experience=20, responsibilities=15, preferred=8, projects=8, formatting=5), rationale='Invalid baseline')
        with self.assertRaisesRegex(ValueError, 'Invalid alignment'):
            self.run_pipeline([self.plan, self.aggressive_draft(), {'issues': [], 'alignment': invalid}, self.recruiter_review], 'aggressive')

    def test_aggressive_second_correction_is_bounded_and_can_pass(self):
        review = dict(self.recruiter_review, issues=['Tighten overloaded accomplishment.'])
        result, model = self.run_pipeline([
            self.plan, self.aggressive_draft(), {'issues': []}, review,
            self.aggressive_draft(), {'issues': []}, review,
            self.aggressive_draft(), {'issues': []}, self.recruiter_review], 'aggressive')
        self.assertEqual(model.call_count, 10)
        self.assertIn('surgical final correction', model.call_args_list[7].args[2])
        self.assertIn('Do not introduce new metrics', model.call_args_list[7].args[2])
        self.assertEqual(result['quality']['status'], 'passed')
        self.assertIn('exportApproval', result)

    def test_observations_do_not_trigger_revision_or_block_export(self):
        report = {'issues': [], 'findings': [dict(severity='observation', detail='Five years meets the threshold; no repair needed.')]}
        result, model = self.run_pipeline([self.plan, self.aggressive_draft(), report, self.recruiter_review], 'aggressive')
        self.assertEqual(model.call_count,4)
        self.assertEqual(result['quality']['status'],'passed')
        self.assertIn('exportApproval',result)
        self.assertIn('Five years meets the threshold; no repair needed.',result['reviewSuggestions'])

    def test_expected_synthetic_addition_flag_does_not_force_revision(self):
        role = next(r for r in self.rows if r['kind'] == 'role' and r['section'] == 'Experience')
        addition = dict(group=role['group'], text='Deployed Python services on Kubernetes with health checks and automated rollback.',
                        reason='Covers container orchestration.', requirements=['q2'])
        record = dict(target=role['group'], requirement_ids=['q2'], problem='Releases lacked automated recovery.',
                      environment='Python services and Kubernetes.', responsibility='Own service deployment configuration.',
                      implementation='Add health checks and automated rollback.', validation='Deployment and rollback tests.', outcome='Improve release recovery.',
                      metric_basis='No synthetic metric.', metric={}, generated_details=['Kubernetes deployment scenario'])
        result, model = self.run_pipeline([self.plan, self.aggressive_draft(additions=[addition], evidence_ledger=[record]), {'issues': []}, self.recruiter_review], 'aggressive')
        self.assertEqual(model.call_count, 4)
        self.assertEqual(result['quality']['status'], 'passed')
        self.assertEqual(result['evidence_ledger'][0]['row_id'], 'addition0')

    def test_cleaned_title_is_used_for_summary_check(self):
        report = {'issues': [], 'coverage': [dict(requirement=q['id'], status='missing', rows=[], reason='No evidence') for q in REQS]}
        result = engine.fit_result(engine.build(self.rows, self.draft, 'medium', REQS), REQS)
        with patch.object(engine, 'claude', return_value=(report, self.usage)):
            issues, _ = engine.audit({}, self.rows, JD, REQS, result, 'medium', 'Backend Engineer — Payments & Integration', None)
        self.assertFalse(any('target title' in i for i in issues))

    def test_weaker_revision_does_not_replace_better_draft(self):
        full = [dict(requirement=q['id'], status='missing' if q['status']=='unsupported' else 'covered', rows=['r9'], reason='Test evidence') for q in REQS]
        weaker = [dict(requirement=q['id'], status='missing', rows=[], reason='Evidence lost') for q in REQS]
        result, model = self.run_pipeline([self.draft, {'issues': ['Improve wording.'], 'coverage': full}, self.draft, {'issues': [], 'coverage': weaker}])
        self.assertEqual(model.call_count, 4)
        self.assertEqual(result['coverage']['score'], 100)
        self.assertTrue(any('stronger first draft' in s for s in result['verification']))


class CoverageAndBullets(unittest.TestCase):
    def test_coverage_cannot_claim_missing_or_hidden_evidence(self):
        from tailoring_quality import coverage_report
        rows = [dict(id='visible', include=True), dict(id='hidden', include=False)]
        report = coverage_report(REQS, rows, [dict(requirement=q['id'], status='covered', rows=['hidden' if q['id']=='q1' else 'visible'], reason='Claim') for q in REQS])
        self.assertEqual([r['status'] for r in report['requirements']], ['missing', 'missing', 'covered'])
        self.assertEqual(report['score'], 25)  # q1 has weight 3; q3 weight 1. Unsupported q2 excluded.

    def test_generative_coverage_includes_previously_unsupported_requirements(self):
        from tailoring_quality import coverage_report
        rows = [dict(id='visible', include=True)]
        entries = [dict(requirement=q['id'], status='covered', rows=['visible'], reason='Generated coverage') for q in REQS]
        report = coverage_report(REQS, rows, entries, generative=True)
        self.assertEqual([r['status'] for r in report['requirements']], ['covered', 'covered', 'covered'])
        self.assertEqual(report['score'], 100)
        self.assertIn('JD coverage', report['method'])

    def test_incomplete_coverage_never_displays_a_score(self):
        from tailoring_quality import coverage_report
        report = coverage_report(REQS, [], [])
        self.assertFalse(report['complete'])
        self.assertIsNone(report['score'])

    def test_action_openings_flag_weak_phrases_without_forcing_synonyms(self):
        from tailoring_quality import bullet_issues
        rows = [dict(id='weak', kind='bullet', after='Responsible for API development.'),
                dict(id='strong', kind='bullet', after='Built Python APIs to reconcile payment records.')]
        self.assertEqual(len(bullet_issues(rows)), 1)
        self.assertIn('weak', bullet_issues(rows)[0])


class ResponseLimits(unittest.TestCase):
    def test_generative_requests_use_expanded_output_budget(self):
        from types import SimpleNamespace
        response = SimpleNamespace(
            stop_reason='end_turn', content=[SimpleNamespace(type='text', text='{}')],
            usage=SimpleNamespace(input_tokens=1, output_tokens=1, cache_creation_input_tokens=0, cache_read_input_tokens=0))
        with patch('anthropic.Anthropic') as client:
            stream = client.return_value.messages.stream.return_value.__enter__.return_value
            stream.get_final_message.return_value = response
            client.return_value.messages.create.return_value = response
            engine.claude({'api_key': 'test', 'model': 'claude-haiku-5-5'}, [], 'task', {}, generative=True)
            engine.claude({'api_key': 'test', 'model': 'claude-haiku-5-5'}, [], 'task', {})
        limits = [client.return_value.messages.stream.call_args.kwargs['max_tokens'],
                  client.return_value.messages.create.call_args.kwargs['max_tokens']]
        self.assertEqual(limits, [32768, 16000])
        stream.get_final_message.assert_called_once_with()

    def test_cutoff_error_reports_actual_budget_without_blaming_jd_length(self):
        from types import SimpleNamespace
        response = SimpleNamespace(stop_reason='max_tokens', content=[])
        with patch('anthropic.Anthropic') as client:
            stream = client.return_value.messages.stream.return_value.__enter__.return_value
            stream.get_final_message.return_value = response
            with self.assertRaisesRegex(ValueError, '32,768-token output budget') as caught:
                engine.claude({'api_key': 'test', 'model': 'claude-haiku-5-5'}, [], 'task', {}, generative=True)
        self.assertNotIn('shorter job description', str(caught.exception))


if __name__ == '__main__':
    unittest.main()

class RegressionQuality(unittest.TestCase):
    def test_education_cannot_be_edited_or_dropped(self):
        rows = engine.structure(RESUME + '\nEducation\nBS Computer Science, Example University\n')
        degree = rows[-1]
        draft = out(edits=[dict(id=degree['id'], text='PhD Computer Science', reason='', requirements=[])], drop=[degree['id']])
        result = engine.build(rows, draft, 'aggressive', REQS)
        actual = next(r for r in result['rows'] if r['id'] == degree['id'])
        self.assertEqual(actual['after'], degree['text'])
        self.assertTrue(actual['include'])

    def test_generated_missing_report_includes_supported_requirement_lost_in_draft(self):
        from tailoring_quality import missing_report
        result = dict(generative=True, coverage=dict(complete=True, requirements=[
            dict(requirement=q['id'], status='missing', reason='No final accomplishment') for q in REQS]))
        report = missing_report(REQS, result)
        self.assertEqual(len(report), 3)
        self.assertTrue(all(r['category'] == 'Missing from generated draft' for r in report))

class ConcurrentReviews(unittest.TestCase):
    def test_reviews_overlap_and_merge_without_losing_findings(self):
        import threading
        barrier = threading.Barrier(2)
        usage = dict(model='test', cost=.01, input=1, output=1)
        def technical(*args):
            result = args[4]
            barrier.wait(timeout=2)
            result['coverage'] = {'score':80}
            return ['Technical issue'], usage
        def recruiter(*args):
            result = args[3]
            barrier.wait(timeout=2)
            result['document_qa'] = {'visual_inspection':True}
            return ['Visual issue'], usage
        result = {'rows':[]}
        with patch.object(engine, 'audit', side_effect=technical), patch.object(engine, 'recruiter_review', side_effect=recruiter):
            issues, total = engine.evaluate({}, [], '', [], result, 'aggressive', '', None)
        self.assertEqual(issues, ['Technical issue', 'Visual issue'])
        self.assertEqual(result['coverage']['score'], 80)
        self.assertTrue(result['document_qa']['visual_inspection'])
        self.assertEqual(total['cost'], .02)

class IncompleteAccomplishments(unittest.TestCase):
    def test_unclassified_experience_text_is_checked(self):
        from tailoring_quality import bullet_issues
        rows = [dict(id='r1',kind='text',section='Professional Experience',after='Developed APIs; contributed to'),
                dict(id='r2',kind='bullet',section='Experience',after='Monitored improvements, including p95'),
                dict(id='r3',kind='bullet',section='Experience',after='Reduced p95 latency to 150 ms.')]
        issues = bullet_issues(rows)
        self.assertEqual(len(issues),2)
        self.assertTrue(all('unfinished' in i for i in issues))

class AccomplishmentStructure(unittest.TestCase):
    def test_normalization_preserves_source_and_headings(self):
        from tailoring_quality import normalize_accomplishments
        source = [dict(id='r1', kind='text', section='Experience', group='Engineer, Acme', text='Designed Python APIs for payment reconciliation.'),
                  dict(id='r2', kind='text', section='Experience', group='Engineer, Acme', text='Seattle, WA'),
                  dict(id='r3', kind='text', section='Education', group='', text='Master of Science')]
        actual = normalize_accomplishments(source)
        self.assertEqual([r['kind'] for r in actual], ['bullet', 'text', 'text'])
        self.assertEqual(source[0]['kind'], 'text')
        self.assertEqual(actual[0]['id'], source[0]['id'])
        self.assertEqual(actual[0]['text'], source[0]['text'])

    def test_export_rejects_observed_incomplete_points(self):
        from tailoring_quality import validate_export_accomplishments
        for kind, text in [('text', 'Developed services; contributed to'), ('bullet', 'Monitored performance, including p95')]:
            with self.assertRaisesRegex(ValueError, 'mid-sentence'):
                validate_export_accomplishments([['section', 'Professional Experience'], [kind, text]])
        validate_export_accomplishments([['section','Experience'], ['bullet','Optimized SQL indexes to reduce p95 latency to 150 ms.']])

class WrappedSourceRegression(unittest.TestCase):
    def test_join_wrapped_points_and_keep_evidence_ids(self):
        from tailoring_quality import normalize_accomplishments
        texts = ['Developed APIs; contributed to', 'systems supporting 500M+ requests/day.',
                 'Orchestrated workflows through parallel', 'execution.',
                 'Added regression tests to validate changes', 'before merge.']
        rows = [dict(id=f'r{i}',kind='text',section='Experience',group='Engineer',text=t) for i,t in enumerate(texts)]
        actual = normalize_accomplishments(rows)
        self.assertEqual(len(actual),3)
        self.assertEqual([r['text'] for r in actual], [' '.join(texts[i:i+2]) for i in (0,2,4)])
        self.assertEqual(actual[0]['source_ids'], ['r0','r1'])
        self.assertEqual(normalize_accomplishments(actual), actual)
        self.assertEqual(len(rows),6)

    def test_does_not_merge_roles_or_independent_actions(self):
        from tailoring_quality import normalize_accomplishments
        rows = [dict(id='a',kind='text',section='Experience',group='First',text='Built APIs'),
                dict(id='b',kind='text',section='Experience',group='First',text='Improved deployment automation.'),
                dict(id='c',kind='text',section='Experience',group='Second',text='Seattle, WA')]
        self.assertEqual(len(normalize_accomplishments(rows)),3)

class ExportApproval(unittest.TestCase):
    def test_review_is_bound_to_exact_content(self):
        from export_quality import approval, validate
        lines = [['name','Test Person'], ['bullet','Built Python services.']]
        token = approval(lines)
        validate(lines, token)
        with self.assertRaisesRegex(ValueError,'not passed review'):
            validate([*lines, ['bullet','Invented a new claim.']], token)
        with self.assertRaises(ValueError):
            validate(lines, None)

class V3Regressions(unittest.TestCase):
    def test_lowercase_action_continuation_stays_with_project(self):
        from tailoring_quality import normalize_accomplishments
        rows = [dict(id='a', kind='bullet', section='Projects', group='Fault explorer', text='Implemented regression tests and'),
                dict(id='b', kind='text', section='Projects', group='Fault explorer', text='validated an external saga.')]
        actual = normalize_accomplishments(rows)
        self.assertEqual(len(actual),1)
        self.assertEqual(actual[0]['text'],'Implemented regression tests and validated an external saga.')

    def test_alignment_schema_requires_same_rubric_for_both_versions(self):
        schema=engine.GENERATIVE_AUDIT_SCHEMA['properties']['alignment']
        self.assertIn('initial_rubric',schema['required'])
        self.assertEqual(schema['properties']['initial_rubric'],schema['properties']['rubric'])

    def test_summary_can_name_relevant_technologies_without_inventory(self):
        from tailoring_quality import summary_issues
        rows=[dict(kind='text',section='Summary',after='Backend engineer building Java and Python services with Spring Boot.'),
              dict(kind='text',section='Skills',after='Backend: Java, Python, Spring Boot')]
        self.assertEqual(summary_issues(rows),[])

class MetricQuantityRegression(unittest.TestCase):
    def record(self, baseline, final, calculation):
        return dict(target='r1', metric_basis='Illustrative measurement.', metric=dict(
            name='Measured outcome',baseline=baseline,final=final,unit='rate',period='12 weeks',
            calculation=calculation,validation='Matched observation windows',causality='Automated delivery'))

    def test_rate_denominators_are_compared(self):
        from tailoring_quality import metric_issues
        self.assertEqual(metric_issues([self.record('1 release per 2 weeks','1 release per week','100% increase')]),[])
        self.assertTrue(metric_issues([self.record('1 release per 2 weeks','1 release per week','0% increase')]))

    def test_time_units_are_normalized(self):
        from tailoring_quality import metric_issues
        self.assertEqual(metric_issues([self.record('1.2 s','600 ms','50% reduction')]),[])

    def test_change_direction_is_checked(self):
        from tailoring_quality import metric_issues
        self.assertTrue(metric_issues([self.record('200 ms','100 ms','50% increase')]))

    def test_zero_baseline_is_not_a_valid_percentage(self):
        from tailoring_quality import metric_issues
        self.assertTrue(metric_issues([self.record('0 ms','50 ms','100% increase')]))
