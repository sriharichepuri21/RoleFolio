"""Role planning and final coverage reporting, separate from keyword overlap."""
import re

ACTION = re.compile(r'^(?:Designed|Developed|Built|Implemented|Integrated|Optimized|Refactored|Orchestrated|Automated|Added|Diagnosed|Investigated|Resolved|Deployed|Migrated|Validated|Improved|Reduced|Led|Maintained|Engineered|Coordinated|Wrote|Mentored)\b', re.I)


def normalize_accomplishments(rows):
    """Join wrapped accomplishments before rewriting; retain source IDs for evidence mapping."""
    normalized = []
    for original in rows:
        r = dict(original)
        accomplishment = bool(r.get('group') and re.search(r'experience|employment|internship|project', r.get('section', ''), re.I))
        previous = normalized[-1] if normalized else None
        continuation = (previous and previous['kind'] == 'bullet' and previous['group'] == r.get('group')
                        and not re.search(r'[.!?]$', previous['text'].strip())
                        and r['text'].strip()[:1].islower())
        if r['kind'] == 'text' and accomplishment and ACTION.match(r['text'].strip()) and not continuation:
            r['kind'] = 'bullet'
        if (r['kind'] == 'text' and accomplishment and previous and previous['kind'] == 'bullet'
                and previous['group'] == r['group'] and previous['section'] == r['section']
                and not re.search(r'[.!?]$', previous['text'].strip())):
            previous['text'] += ' ' + r['text'].strip()
            previous.setdefault('source_ids', [previous['id']]).append(r['id'])
        else:
            normalized.append(r)
    return normalized


def unfinished(text):
    return bool(re.search(r'\b(?:contributed to|including|including p\d+|resulting in|such as|through|using|with|and|by)\s*[.,;:]?$', text.strip(), re.I))


def validate_export_accomplishments(lines):
    section = ''
    for kind, text in lines:
        if kind == 'section':
            section = text
        if (kind == 'bullet' or kind == 'text' and re.search(r'experience|employment|project', section, re.I)) and unfinished(text):
            raise ValueError('An accomplishment ends mid-sentence. Complete or remove the unfinished clause before exporting: ' + text[-100:])

METRIC_SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'required': ['name', 'baseline', 'final', 'unit', 'period', 'calculation', 'validation', 'causality'],
    'properties': {field: {'type': 'string'} for field in
                   ('name', 'baseline', 'final', 'unit', 'period', 'calculation', 'validation', 'causality')}}

ENGINEERING_SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'required': ['target', 'requirement_ids', 'problem', 'environment', 'responsibility', 'implementation', 'validation', 'outcome', 'metric_basis', 'metric', 'generated_details'],
    'properties': {
        'target': {'type': 'string'},
        'requirement_ids': {'type': 'array', 'items': {'type': 'string'}},
        'problem': {'type': 'string'}, 'environment': {'type': 'string'}, 'responsibility': {'type': 'string'},
        'implementation': {'type': 'string'}, 'validation': {'type': 'string'}, 'outcome': {'type': 'string'},
        'metric_basis': {'type': 'string'}, 'metric': METRIC_SCHEMA,
        'generated_details': {'type': 'array', 'items': {'type': 'string'}}}}

BLUEPRINT_SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'required': ['specialization', 'p0_requirements', 'p1_requirements', 'p2_requirements', 'p3_requirements',
                 'architectural_themes', 'expected_ownership', 'seniority', 'mandatory_constraints', 'operational_metrics', 'project_evidence'],
    'properties': {
        'specialization': {'type': 'string'}, 'expected_ownership': {'type': 'string'}, 'seniority': {'type': 'string'},
        **{field: {'type': 'array', 'items': {'type': 'string'}} for field in
           ('p0_requirements', 'p1_requirements', 'p2_requirements', 'p3_requirements', 'architectural_themes',
            'mandatory_constraints', 'operational_metrics', 'project_evidence')}}}

TIMELINE_SCHEMA = {'type': 'array', 'items': {
    'type': 'object', 'additionalProperties': False,
    'required': ['role', 'start', 'end', 'seniority', 'technical_theme'],
    'properties': {field: {'type': 'string'} for field in ('role', 'start', 'end', 'seniority', 'technical_theme')}}}

PLAN_SCHEMA = {
    'type': 'object', 'additionalProperties': False,
    'required': ['narrative', 'blueprint', 'candidate_timeline', 'priorities', 'bullets', 'matrix'],
    'properties': {
        'narrative': {'type': 'string'}, 'blueprint': BLUEPRINT_SCHEMA, 'candidate_timeline': TIMELINE_SCHEMA,
        'priorities': {'type': 'array', 'items': {'type': 'string'}},
        'bullets': {'type': 'array', 'items': {
            'type': 'object', 'additionalProperties': False,
            'required': ['row_id', 'requirements', 'direction'],
            'properties': {'row_id': {'type': 'string'}, 'requirements': {'type': 'array', 'items': {'type': 'string'}},
                           'direction': {'type': 'string'}}}},
        'matrix': {'type': 'array', 'items': ENGINEERING_SCHEMA}}}

COVERAGE_SCHEMA = {'type': 'array', 'items': {
    'type': 'object', 'additionalProperties': False,
    'required': ['requirement', 'status', 'rows', 'reason'],
    'properties': {'requirement': {'type': 'string'},
                   'status': {'type': 'string', 'enum': ['covered', 'partial', 'missing']},
                   'rows': {'type': 'array', 'items': {'type': 'string'}}, 'reason': {'type': 'string'}}}}


def bullet_issues(rows):
    issues = []
    for r in rows:
        if r['kind'] != 'bullet' and not (r['kind'] == 'text' and re.search(r'experience|employment|internship|project', r.get('section', ''), re.I)):
            continue
        text = r['after'].strip()
        if unfinished(text):
            issues.append(f"{r['id']}: unfinished accomplishment; complete the implementation and outcome from its source or remove the dangling clause. Never guess missing metrics.")
        if re.match(r'^(?:responsible for|worked on|helped with|involved in|duties included|experience (?:in|with)|[Ii] (?:was|am)|was tasked with)\b', text, re.I):
            issues.append(f"{r['id']}: replace the weak opening with the specific action actually performed; retain the original scope.")
        if re.match(r'^[^:]{1,50}:', text):
            issues.append(f"{r['id']}: lead with an action verb rather than a category label.")
    return issues


def summary_issues(rows):
    from engine import SUMMARY, SKILLS, has
    summary = ' '.join(r['after'] for r in rows if r['kind'] == 'text' and SUMMARY.search(r['section']))
    issues = []
    if 'SYNTHETIC SAMPLE' in summary.upper():
        issues.append('Keep the synthetic disclosure out of the summary; the PDF footer carries it.')
    skills = []
    for r in rows:
        if r['kind'] not in ('text', 'bullet') or not SKILLS.search(r['section']):
            continue
        for line in r['after'].splitlines():
            skills.extend(item.strip() for item in line.split(':', 1)[-1].split(','))
    repeated = list(dict.fromkeys(item for item in skills if 2 <= len(item) <= 40 and has(summary, item)))
    if len(repeated) > 5:
        issues.append('Summary repeats the skills inventory (' + ', '.join(repeated) + '); emphasize specialization and production ownership instead.')
    return issues


def engineering_issues(rows, ledger):
    issues = []
    by_row = {e.get('row_id'): e for e in ledger}
    for r in rows:
        if (r['kind'] == 'bullet' and re.search(r'experience|projects', r['section'], re.I)
                and (not r['before'] or r['after'] != r['before']) and r['id'] not in by_row):
            issues.append(f"{r['id']}: establish the problem, architecture, ownership, implementation, and result in the evidence ledger before generating this bullet.")
    required = ('problem', 'environment', 'responsibility', 'implementation', 'validation', 'outcome')
    for e in ledger:
        missing = [field for field in required if not e.get(field, '').strip()]
        if not e.get('requirement_ids'):
            missing.append('requirement_ids')
        if missing:
            issues.append(f"{e.get('row_id') or e.get('target')}: evidence ledger is missing {', '.join(missing)}.")
    return issues


def metric_value(text):
    """Compare quantities, not just the first digit of a rate or duration."""
    number = r'(\d+(?:,\d{3})*(?:\.\d+)?)'
    match = re.search(number, text)
    if not match:
        return None
    value = float(match[1].replace(',', ''))
    rate = re.search(r'\bper\s+(?:(\d+(?:\.\d+)?)\s+)?(day|week|year)s?\b', text, re.I)
    if rate:
        denominator = float(rate[1] or 1) * {'day': 1, 'week': 7, 'year': 365}[rate[2].lower()]
        return value / denominator if denominator else None
    unit = re.match(r'\s*(ms|milliseconds?|s|seconds?)\b', text[match.end():], re.I)
    if unit and unit[1].lower() in ('s', 'second', 'seconds'):
        value *= 1000
    return value


def metric_issues(ledger):
    issues = []
    number = r'(\d+(?:,\d{3})*(?:\.\d+)?)'
    for e in ledger:
        basis = e.get('metric_basis', '').strip()
        metric = e.get('metric') or {}
        structured = any(str(value).strip() for value in metric.values())
        if basis.lower() in ('', 'no synthetic metric', 'no synthetic metric.') and not structured:
            continue
        target = e.get('row_id') or e.get('target')
        if structured:
            required = ('name', 'baseline', 'final', 'unit', 'period', 'calculation', 'validation', 'causality')
            missing = [field for field in required if not str(metric.get(field, '')).strip()]
            if missing:
                issues.append(f"{target}: metric record is missing {', '.join(missing)}.")
                continue
            baseline_text = metric['baseline']
            result_text = metric['final']
            calculation = metric['calculation']
        else:
            if not re.search(r'\d', basis):
                issues.append(f'{target}: metric basis needs a numeric baseline, result, unit, and calculation.')
                continue
            baseline_text = basis
            result_text = basis
            calculation = basis
        baseline = (re.search(number, baseline_text) if structured else
                    re.search(r'\bbaseline\s*(?::|=|was|of)?\s*' + number, basis, re.I))
        result = (re.search(number, result_text) if structured else
                  re.search(r'\b(?:optimized|result|final|after)\s*(?::|=|was|of)?\s*' + number, basis, re.I))
        claimed = re.search(number + r'\s*%', calculation)
        if structured and (not baseline or not result):
            issues.append(f'{target}: metric baseline and final value must be numeric.')
        if baseline and result and claimed:
            before = metric_value(baseline_text) if structured else float(baseline.group(1).replace(',', ''))
            after = metric_value(result_text) if structured else float(result.group(1).replace(',', ''))
            if before is None or after is None or before == 0:
                issues.append(f'{target}: percentage change needs a valid nonzero baseline and comparable final value.')
                continue
            shown = float(claimed.group(1).replace(',', ''))
            if (after < before and re.search(r'\bincrease\b', calculation, re.I)
                    or after > before and re.search(r'\b(?:decrease|reduction)\b', calculation, re.I)):
                issues.append(f'{target}: metric change direction contradicts the baseline and final value.')
            expected = abs(before - after) / before * 100 if before else 0
            if abs(expected - shown) > 0.6:
                issues.append(f'{target}: metric calculation is inconsistent; {before:g} to {after:g} is {expected:.1f}%, not {shown:g}%.')
    return issues


def coverage_report(requirements, rows, entries, generative=False):
    from engine import WEIGHT
    visible = {r['id']: r for r in rows if r['include']}
    known = {q['id']: q for q in requirements}
    counts = {}
    for e in entries:
        counts[e['requirement']] = counts.get(e['requirement'], 0) + 1
    normalized = []
    for q in requirements:
        matches = [e for e in entries if e['requirement'] == q['id']]
        e = matches[0] if len(matches) == 1 else dict(status='missing', rows=[], reason='Coverage was not assessed reliably.')
        ids = [i for i in e['rows'] if i in visible]
        status = e['status'] if ids else 'missing'
        if q['status'] == 'unsupported' and not generative:
            status, ids = 'missing', []
        normalized.append(dict(requirement=q['id'], text=q['text'], status=status, rows=ids, reason=e['reason']))
    complete = all(counts.get(i) == 1 for i in known) and all(e['requirement'] in known for e in entries)
    eligible = list(requirements) if generative else [q for q in requirements if q['status'] != 'unsupported']
    by_id = {e['requirement']: e for e in normalized}
    weight = sum(WEIGHT[q['type']] for q in eligible)
    score = round(100 * sum(WEIGHT[q['type']] * {'covered': 1, 'partial': .5, 'missing': 0}[by_id[q['id']]['status']]
                            for q in eligible) / weight) if weight and complete else None
    method = ('Model-reviewed JD coverage in the generated test resume; weights 3/2/1, partial credit 0.5. Not an ATS score.' if generative else
              'Model-reviewed presentation of supported or transferable evidence; weights 3/2/1, partial credit 0.5. Not job fit or an ATS score.')
    return dict(score=score, complete=complete, requirements=normalized, method=method)


def missing_report(requirements, result):
    audited = result.get('coverage', {})
    coverage = {e['requirement']: e for e in audited.get('requirements', [])} if audited.get('complete') else {}
    report = []
    for q in requirements:
        c = coverage.get(q['id'])
        if result.get('generative') and c and c['status'] != 'covered':
            category = 'Missing from generated draft' if c['status'] == 'missing' else 'Incomplete in generated draft'
        elif q['status'] == 'unsupported':
            category = 'Not established in your resume'
        elif q['status'] == 'transferable':
            category = 'Related experience; confirm the remaining gap'
        elif c and c['status'] != 'covered':
            category = 'Supported experience not fully communicated'
        else:
            continue
        report.append(dict(requirement=q['id'], text=q['text'], category=category,
                           detail=q.get('note', '') + ((' ' + c['reason']) if c else ''),
                           question='What have you personally done for this requirement? Specify the role or project, tools, action, and actual outcome. If none, keep it as a gap.'))
    return report
