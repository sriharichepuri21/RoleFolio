"""Run: .venv/bin/python -m unittest -v"""
import unittest

import engine

RESUME = """Jane Doe
jane@example.com | 555-0100
@ GitHub https://github.com/jane | LinkedIn https://linkedin.com/in/jane
Summary
Backend engineer with five years building payment systems. Cares about reliability.
Technical Skills
Python, Go, PostgreSQL, Kafka, AWS, Docker
Experience
Acme Pay — Software Engineer, 2021 – Present
• Built a Kafka pipeline in Python that processed 2M events per day.
• Reduced checkout latency by 35% by tuning PostgreSQL indexes.
• Mentored two junior engineers through code reviews
and design docs.
Projects
Ledger CLI
- Wrote a Go CLI for reconciling ledgers.
"""

REQS = [
    dict(id="q1", text="Python services", type="required", keywords=["Python"], status="supported", evidence=["r9"], note=""),
    dict(id="q2", text="Kubernetes", type="required", keywords=["Kubernetes"], status="unsupported", evidence=[], note=""),
    dict(id="q3", text="Event streaming", type="preferred", keywords=["Kafka", "event streaming"], status="supported", evidence=["r9"], note=""),
]


def out(**kw):
    base = dict(title="Senior Backend Engineer", summary="", skills=[], edits=[], additions=[], order=[], drop=[], verification=[], evidence_ledger=[])
    base.update(kw)
    return base


def ledger(target, metric_basis="No synthetic metric."):
    return dict(target=target, requirement_ids=["q2"], problem="Release reliability needs improvement.",
                environment="Python services deployed to Kubernetes.", responsibility="Own the deployment workflow.",
                implementation="Add health checks and automated rollback.", validation="Deployment and rollback tests.", outcome="Reduce failed release recovery time.",
                metric_basis=metric_basis, metric=dict(name="", baseline="", final="", unit="", period="", calculation="", validation="", causality=""), generated_details=["Kubernetes deployment scenario"])


class Structure(unittest.TestCase):
    def setUp(self):
        self.rows = engine.structure(RESUME)
        self.kinds = {r["text"][:20]: r["kind"] for r in self.rows}

    def test_kinds(self):
        self.assertEqual(self.rows[0]["kind"], "name")
        self.assertEqual(self.rows[1]["kind"], "contact")
        self.assertEqual(self.rows[2]["kind"], "links")
        self.assertEqual(self.kinds["Acme Pay — Software "], "role")
        self.assertEqual(self.kinds["Ledger CLI"], "role")
        self.assertEqual(self.kinds["Wrote a Go CLI for r"], "bullet")

    def test_linked_project_title_restored(self):
        rows = engine.structure("Jane\nj@x.com\nProjects\n@ Ledger CLI https://github.com/j/l\n• Wrote a CLI.")
        self.assertEqual([(r["kind"], r["text"]) for r in rows[3:5]], [("role", "Ledger CLI"), ("links", "Ledger CLI https://github.com/j/l")])

    def test_wrapped_bullet_joined_and_groups(self):
        mentor = next(r for r in self.rows if r["text"].startswith("Mentored"))
        self.assertTrue(mentor["text"].endswith("and design docs."))
        self.assertEqual(mentor["group"], "Acme Pay — Software Engineer, 2021 – Present")
        self.assertEqual(mentor["section"], "Experience")


class Guard(unittest.TestCase):
    def setUp(self):
        self.rows = engine.structure(RESUME)
        self.bullet = next(r for r in self.rows if r["text"].startswith("Built"))

    def build(self, level="medium", **kw):
        return engine.build(self.rows, out(**kw), level, REQS)

    def test_invented_metric_rejected(self):
        res = self.build(edits=[dict(id=self.bullet["id"], text="Built a Kafka pipeline processing 5M events per day.", reason="", requirements=[])])
        row = next(r for r in res["rows"] if r["id"] == self.bullet["id"])
        self.assertEqual(row["after"], self.bullet["text"])
        self.assertIn("5m", row["flag"])

    def test_unsupported_keyword_rejected(self):
        res = self.build(edits=[dict(id=self.bullet["id"], text="Built a Kafka pipeline on Kubernetes that processed 2M events per day.", reason="", requirements=[])])
        self.assertIn("Kubernetes", next(r for r in res["rows"] if r["id"] == self.bullet["id"])["flag"])

    def test_truthful_edit_applied(self):
        text = "Engineered an event streaming pipeline with Kafka and Python processing 2M events per day."
        res = self.build(edits=[dict(id=self.bullet["id"], text=text, reason="Surfaces event streaming", requirements=["q3"])])
        row = next(r for r in res["rows"] if r["id"] == self.bullet["id"])
        self.assertEqual((row["after"], row["flag"]), (text, ""))
        self.assertGreaterEqual(res["scores"]["after"], res["scores"]["before"])

    def test_role_rows_and_basic_level_immutable(self):
        role = next(r for r in self.rows if r["kind"] == "role")
        res = self.build(level="basic", edits=[dict(id=role["id"], text="Staff Engineer", reason="", requirements=[]),
                                               dict(id=self.bullet["id"], text="Rewritten.", reason="", requirements=[])])
        texts = {r["id"]: r["after"] for r in res["rows"]}
        self.assertEqual(texts[role["id"]], role["text"])
        self.assertEqual(texts[self.bullet["id"]], self.bullet["text"])

    def test_skills_filtered_and_title_inserted(self):
        res = self.build(skills=[dict(category="Languages", items=["Python", "Go", "Rust"])])
        skill_rows = [r for r in res["rows"] if r["id"].startswith("skill")]
        self.assertEqual([r["after"] for r in skill_rows], ["Languages: Python, Go"])
        self.assertTrue(any("Rust" in n for n in res["notes"]))
        self.assertEqual(next(r for r in res["rows"] if r["id"] == "title")["after"], "Senior Backend Engineer")

    def test_reorder_and_drop(self):
        bullets = [r["id"] for r in self.rows if r["kind"] == "bullet" and r["section"] == "Experience"]
        res = self.build(level="aggressive", order=list(reversed(bullets)), drop=[bullets[0]])
        got = [r["id"] for r in res["rows"] if r["id"] in bullets]
        self.assertEqual(got, list(reversed(bullets)))
        self.assertFalse(next(r for r in res["rows"] if r["id"] == bullets[0])["include"])

    def test_aggressive_accepts_generated_jd_capabilities(self):
        text = "Built a Kafka pipeline on Kubernetes that processed 2M events per day."
        res = self.build(level="aggressive", edits=[dict(id=self.bullet["id"], text=text, reason="", requirements=["q2"])])
        row = next(r for r in res["rows"] if r["id"] == self.bullet["id"])
        self.assertEqual((row["after"], row["flag"]), (text, ""))

    def test_aggressive_retains_requested_skills_without_source_evidence(self):
        res = self.build(level="aggressive", skills=[dict(category="Cloud & DevOps", items=["Kubernetes", "C#"])])
        self.assertEqual(next(r for r in res["rows"] if r["id"] == "skill0")["after"], "Cloud & DevOps: Kubernetes, C#")
        self.assertFalse(any("Removed unevidenced" in n for n in res["notes"]))

    def test_aggressive_addition_stays_in_its_source_role(self):
        role = next(r for r in self.rows if r["kind"] == "role" and r["section"] == "Experience")
        addition = dict(group=role["group"], text="Deployed containerized Python services with Kubernetes for reliable releases.",
                        reason="Covers orchestration requirement.", requirements=["q2"])
        res = self.build(level="aggressive", additions=[addition])
        added = next(r for r in res["rows"] if r["id"] == "addition0")
        self.assertEqual((added["section"], added["group"]), (role["section"], role["group"]))
        role_rows = [r for r in res["rows"] if r["kind"] == "bullet" and r["group"] == role["group"]]
        self.assertIs(role_rows[-1], added)
        self.assertIn("Synthetic JD-aligned", added["flag"])

    def test_aggressive_rejects_undocumented_new_figures(self):
        role = next(r for r in self.rows if r["kind"] == "role")
        addition = dict(group=role["group"], text="Deployed Kubernetes services improving reliability by 99%.",
                        reason="", requirements=["q2"])
        res = self.build(level="aggressive", additions=[addition])
        self.assertFalse(any(r["id"].startswith("addition") for r in res["rows"]))
        self.assertTrue(any("99%" in n for n in res["notes"]))

    def test_aggressive_accepts_ledger_backed_metric_but_medium_rejects_it(self):
        text = "Built a Kafka pipeline in Python that processed 5M events per day."
        edit = dict(id=self.bullet["id"], text=text, reason="", requirements=["q1"])
        record = ledger(self.bullet["id"], "Baseline 2M events/day; optimized 5M events/day; no percentage claimed.")
        aggressive = self.build(level="aggressive", edits=[edit], evidence_ledger=[record])
        row = next(r for r in aggressive["rows"] if r["id"] == self.bullet["id"])
        self.assertEqual((row["after"], row["flag"]), (text, ""))
        medium = self.build(level="medium", edits=[edit], evidence_ledger=[record])
        row = next(r for r in medium["rows"] if r["id"] == self.bullet["id"])
        self.assertEqual(row["after"], self.bullet["text"])
        self.assertIn("5m", row["flag"])
        self.assertEqual(medium["evidence_ledger"], [])

    def test_addition_ledger_target_is_normalized_and_hidden_rows_are_filtered(self):
        role = next(r for r in self.rows if r["kind"] == "role" and r["section"] == "Experience")
        addition = dict(group=role["group"], text="Deployed Python services on Kubernetes with health checks and automated rollback.",
                        reason="Covers orchestration requirement.", requirements=["q2"])
        res = self.build(level="aggressive", additions=[addition], evidence_ledger=[ledger(role["group"])])
        self.assertEqual(res["evidence_ledger"][0]["row_id"], "addition0")
        fitted = engine.fit_result(res, REQS, generative=True)
        self.assertEqual(len(fitted["evidence_ledger"]), 1)
        next(r for r in fitted["rows"] if r["id"] == "addition0")["include"] = False
        fitted = engine.fit_result(fitted, REQS, generative=True)
        self.assertEqual(fitted["evidence_ledger"], [])

    def test_scores(self):
        self.assertEqual(engine.fit(REQS), round(100 * 4 / 7))


class Compare(unittest.TestCase):
    def test_classification(self):
        prior = [["name", "Jane Doe"], ["title", "Backend Engineer"], ["role", "Acme Pay — Software Engineer, 2021 – Present"],
                 ["bullet", "Reduced checkout latency by 35% by tuning PostgreSQL indexes."],
                 ["bullet", "Built a Kafka pipeline in Python that processed 2M events per day."],
                 ["bullet", "Mentored two junior engineers."]]
        current = [["name", "Jane Doe"], ["title", "Platform Engineer"], ["role", "Acme Pay — Senior Software Engineer, 2021 – Present"],
                   ["bullet", "Reduced checkout latency by 40% by tuning PostgreSQL indexes."],
                   ["bullet", "Built a Python and Kafka pipeline that processed 2M events per day."]]
        levels = [(i["level"], i["before"][:12]) for i in engine.compare(prior, current)]
        self.assertIn(("emphasis", "Backend Engin"[:12]), levels)
        self.assertIn(("fact", "Acme Pay — S"), levels)
        self.assertIn(("fact", "Reduced chec"), levels)
        self.assertIn(("wording", "Built a Kafk"), levels)
        self.assertIn(("emphasis", "Mentored two"), levels)

    def test_identical_is_clean(self):
        rows = [["name", "A"], ["title", "T"], ["bullet", "Did x."]]
        self.assertEqual(engine.compare(rows, rows), [])


JD = """Senior Backend Engineer
Company: Stripe
We move fast and go live weekly.
Requirements
- 5+ years of Python and postgresql
- Experience with Kubernetes in production
Responsibilities
- Build event pipelines with Kafka
Nice to have
- Mentoring and code reviews
"""


class Offline(unittest.TestCase):
    def test_full_workflow_without_api(self):
        rows = engine.structure(RESUME)
        a = engine.analyze({"model": "offline"}, rows, JD)
        status = {r["keywords"][0]: (r["status"], r["type"]) for r in a["requirements"]}
        self.assertEqual(a["company"], "Stripe")
        self.assertEqual(status["Python"], ("supported", "required"))
        self.assertEqual(status["Kubernetes"], ("unsupported", "required"))
        self.assertEqual(status["Kafka"][1], "responsibility")
        self.assertEqual(status["mentoring"][0], "supported")
        self.assertNotIn("Go", status)  # "go live" is English, not the language
        self.assertEqual(a["usage"]["cost"], 0)
        for level in ("basic", "medium", "aggressive"):
            t = engine.tailor({"model": "offline"}, rows, JD, a, level, "Senior Backend Engineer")
            self.assertFalse([r for r in t["rows"] if r["flag"]], level)
            self.assertEqual(t["rows"][3]["after"], "Senior Backend Engineer")
        bullet = next(r for r in t["rows"] if r["before"].startswith("Reduced"))
        self.assertIn("PostgreSQL", bullet["after"])  # exact posting spelling kept from the resume


class Template(unittest.TestCase):
    def test_output_follows_template(self):
        rows = engine.structure("Jane\nj@x.com\nProjects\nLedger CLI\n- Wrote a CLI.\nExperience\nAcme, 2021 - 2023\n- Built a pipeline.\nSkills\nPython, Go\n")
        t = engine.build(rows, out(summary="Backend engineer who builds pipelines."), "medium", REQS)
        shown = [(r["kind"], r["after"]) for r in t["rows"] if r["include"]]
        self.assertEqual(shown[2], ("title", "Senior Backend Engineer"))
        self.assertEqual(shown[4], ("text", "Backend engineer who builds pipelines."))  # summary straight under the title
        self.assertEqual([v for k, v in shown if k == "section"], ["Professional Summary", "Skills", "Professional Experience", "Projects"])

    def test_layout_dates_and_links(self):
        import layout
        self.assertEqual(layout.split_entry("Software Engineer, Acme  Jan 2021 – Present | Seattle"), ("Software Engineer, Acme", "Jan 2021 – Present | Seattle"))
        self.assertEqual(layout.split_entry("Ledger CLI"), ("Ledger CLI", ""))
        items = layout.plan([["name", "Jane"], ["contact", "jane@x.com | LinkedIn"], ["links", "LinkedIn https://linkedin.com/in/j"],
                             ["section", "Projects"], ["role", "Ledger CLI"], ["links", "Ledger CLI https://github.com/j/l"]])
        urls = {t: u for i in items for t, u, _ in i["runs"] if u}
        self.assertEqual(urls, {"jane@x.com": "mailto:jane@x.com", "LinkedIn": "https://linkedin.com/in/j", "Ledger CLI": "https://github.com/j/l"})
        self.assertEqual(len(items), 4)  # both links rows merged into the lines they came from
        stray = layout.plan([["name", "J"], ["contact", "GitHub"], ["links", "GitHub https://github.com/j"], ["section", "Skills"],
                             ["text", "CI: GitHub Actions"], ["section", "Projects"], ["role", "Ledger"], ["links", "Ledger https://g.com/l"],
                             ["bullet", "Reconciled ledgers daily."]])
        linked = [(t, u) for i in stray for t, u, _ in i["runs"] if u]
        self.assertEqual(linked, [("GitHub", "https://github.com/j"), ("Ledger", "https://g.com/l")])  # no stray links elsewhere


def long_resume():
    filler = "and coordinated release planning with product, design, data and support partners across several regions"
    parts = ["Jane Doe", "jane@x.com | 555-0100", "Technical Skills", "Languages: Python, Go, Java, Python, Scala, Ruby, Perl",
             "Cloud: AWS, Docker, Terraform, Kubernetes, Docker, Ansible, Chef, Puppet", "Experience"]
    for n, company in enumerate(["LiveRamp", "UNT", "Zebra"]):
        parts.append(f"Software Engineer, {company}  Jan {2023 - 2 * n} – Dec {2024 - 2 * n} | Dallas, TX")
        parts += [f"- Built service {n}{b} in Python in order to process partner data {filler}." for b in range(7)]
    parts[8] = "- Provisioned infrastructure with Terraform for {}.".format(filler)  # the only Terraform evidence (protected)
    parts += ["Projects"]
    for p in ["Kairo", "Ledger", "Atlas"]:
        parts += [p] + [f"- Developed {p} feature {b} {filler}." for b in range(3)]
    parts += ["Leadership", "- Led a 40-person hackathon " + filler + ".", "- Ran weekly study groups " + filler + ".", "- Mentored freshmen " + filler + ".",
              "Education", "B.S. Computer Science, University of North Texas  2016 – 2020 | Denton, TX"]
    return engine.structure("\n".join(parts))


class FitPage(unittest.TestCase):
    reqs = [dict(id="q1", text="Terraform", type="required", keywords=["Terraform"], status="supported", evidence=[], note=""),
            dict(id="q2", text="Python", type="required", keywords=["Python"], status="supported", evidence=[], note="")]

    def test_overflow_is_fitted_in_priority_order(self):
        import fitpage, pdfdoc
        rows = long_resume()
        t = engine.build(rows, out(), "medium", self.reqs)
        self.assertIsNone(fitpage.size(t["rows"]))  # starts well over one page
        fitted, info = fitpage.fit(t["rows"], self.reqs)
        self.assertGreaterEqual(info["size"], fitpage.READABLE)
        pdfdoc.render(fitpage.lines(fitted))  # exports as exactly one page
        kept = {r["after"] for r in fitted if r["include"]}
        self.assertTrue(any("Terraform" in k for k in kept))  # core evidence protected
        for p in ["Kairo", "Ledger", "Atlas"]:  # equal relevance retains the first bullet
            self.assertIn(f"Developed {p} feature 0 " + "and coordinated release planning with product, design, data and support partners across several regions.", kept)
        self.assertTrue(any(l.startswith("Removed repeated skills") for l in info["log"]))
        per_role = [sum(1 for r in fitted if r["include"] and r["kind"] == "bullet" and c in r["group"]) for c in ("LiveRamp", "UNT", "Zebra")]
        self.assertGreaterEqual(per_role[0], 3)  # latest role keeps the most room
        self.assertTrue(all(n >= 2 for n in per_role[1:]))
        self.assertGreaterEqual(per_role[0], max(per_role[1:]))
        self.assertTrue(any("secondary project" in r["reason"] for r in fitted if not r["include"]))
        roles = {r["group"] for r in fitted if r["kind"] == "bullet" and r["include"] and r["section"] == "Experience"}
        self.assertEqual(len(roles), 3)  # no role loses all its bullets

    def test_project_fit_preserves_most_relevant_bullet(self):
        import fitpage
        rows = long_resume()
        strongest = next(r for r in rows if r["text"].startswith("Developed Kairo feature 2"))
        strongest["text"] = strongest["text"].replace("and coordinated", "using Python and coordinated")
        fitted, _ = fitpage.fit(engine.build(rows, out(), "medium", self.reqs)["rows"], self.reqs)
        kept = [r["after"] for r in fitted if r["include"] and r["group"] == "Kairo"]
        self.assertTrue(any(text.startswith("Developed Kairo feature 2") and "Python" in text for text in kept))
        self.assertFalse(any(text.startswith("Developed Kairo feature 0") for text in kept))

    def test_aggressive_fit_keeps_one_leadership_bullet(self):
        import fitpage
        fitted, _ = fitpage.fit(engine.build(long_resume(), out(), "aggressive", self.reqs)["rows"], self.reqs, generative=True)
        leadership = [r for r in fitted if r["include"] and r["kind"] == "bullet" and r["section"] == "Leadership"]
        self.assertEqual(len(leadership), 1)
        self.assertTrue(leadership[0]["after"].startswith("Led a 40-person hackathon"))

    def test_spare_room_restores_experience(self):
        import fitpage
        rows = engine.structure(RESUME)
        t = engine.build(rows, out(drop=[r["id"] for r in rows if r["text"].startswith("Mentored")]), "aggressive", REQS)
        self.assertFalse(next(r for r in t["rows"] if r["before"].startswith("Mentored"))["include"])
        fitted, info = fitpage.fit(t["rows"], REQS)
        self.assertFalse(next(r for r in fitted if r["before"].startswith("Mentored"))["include"])  # deliberate strategy cuts stay excluded
        self.assertEqual(info["size"], 10.0)  # Approved template retains its documented font size.


class ReferenceFormat(unittest.TestCase):
    def test_unlabelled_summary_is_not_duplicated(self):
        rows = engine.structure('Jane Doe\njane@example.com\nBACKEND ENGINEER\nBuilds Python services.\nWorks with teams.\nSkills\nPython\nExperience\nEngineer, Acme 2020 - Present\n- Built APIs.')
        summary = 'Builds Python services. Works with teams.'
        result = engine.build(rows, out(summary=summary), 'medium', [])
        visible = [r for r in result['rows'] if r['include']]
        self.assertEqual(sum(r['after'] == summary for r in visible), 1)
        self.assertEqual(sum(r['kind'] == 'title' for r in visible), 1)

    def test_fixed_page_fonts_and_phone_link(self):
        import io
        import pdfdoc
        from pypdf import PdfReader
        data = pdfdoc.render([['name', 'Jane Doe'], ['contact', '425-587-5203 | jane@example.com'], ['section', 'Skills'], ['text', 'Languages: Python']])
        reader = PdfReader(io.BytesIO(data))
        self.assertEqual(len(reader.pages), 1)
        self.assertEqual(list(reader.pages[0].mediabox), [0, 0, 612, 792])
        self.assertTrue(data.startswith(b'%PDF-1.4'))
        urls = [a.get_object()['/A']['/URI'] for a in reader.pages[0]['/Annots']]
        self.assertIn('tel:4255875203', urls)
        self.assertIn('mailto:jane@example.com', urls)
        self.assertEqual(pdfdoc.style('skills', 10).fontSize, 10)

    def test_synthetic_pdf_footer_is_visible_and_verified_pdf_omits_it(self):
        import io
        import pdfdoc
        from pypdf import PdfReader
        rows = [['name', 'Jane Doe'], ['contact', 'jane@example.com'], ['section', 'Skills'], ['text', 'Languages: Python']]
        label = 'SYNTHETIC SAMPLE — NOT FOR SUBMISSION'
        synthetic_pdf = pdfdoc.render(rows, synthetic=True)
        verified_pdf = pdfdoc.render(rows)
        synthetic = PdfReader(io.BytesIO(synthetic_pdf)).pages[0].extract_text()
        verified = PdfReader(io.BytesIO(verified_pdf)).pages[0].extract_text()
        self.assertIn(label, synthetic)
        self.assertNotIn('SYNTHETIC SAMPLE', verified)
        self.assertEqual(pdfdoc.validate_pdf(synthetic_pdf, rows, synthetic=True), dict(pages=1, selectable=True, rasterized=True))
        self.assertEqual(pdfdoc.validate_pdf(verified_pdf, rows), dict(pages=1, selectable=True, rasterized=True))
        with self.assertRaisesRegex(ValueError, 'missing or clipped'):
            pdfdoc.validate_pdf(verified_pdf, rows + [['text', 'This content was not rendered.']])


if __name__ == "__main__":
    unittest.main()
