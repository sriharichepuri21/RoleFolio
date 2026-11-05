"""Free, rule-based stand-in for the two Claude calls. Same output shapes as engine.ANALYSIS_SCHEMA / TAILOR_SCHEMA,
so the whole workflow (analysis, tailoring, content guards, export, company checks) runs without an API key.
shortcut: keyword matching only; no real rewriting or aggressive generation. Claude is the upgrade for full tailoring."""
import re

from engine import SKILLS, SUMMARY, has

VOCAB = ("Java|Python|TypeScript|JavaScript|React|Spring Boot|FastAPI|REST APIs|REST|gRPC|AWS|Azure|GCP|Google Cloud|Kubernetes|Docker|"
         "Terraform|Ansible|Jenkins|GitHub Actions|CI/CD|Temporal|Apache Airflow|Airflow|Spark|Hadoop|dbt|PostgreSQL|MySQL|SQL Server|SQL|"
         "NoSQL|MongoDB|DynamoDB|Cassandra|Redis|Elasticsearch|Kafka|RabbitMQ|Snowflake|BigQuery|Databricks|Redshift|Tableau|Power BI|Looker|"
         "Excel|ETL|GraphQL|HTML|CSS|Tailwind|Linux|Bash|Git|OAuth2|OAuth|Golang|Go|Kotlin|Swift|Objective-C|C\\+\\+|C#|\\.NET|Ruby|Rails|Rust|"
         "Scala|PHP|Angular|Vue|Svelte|Node.js|Next.js|Express|Django|Flask|Spring|Hibernate|Grafana|Prometheus|Datadog|CloudWatch|Splunk|"
         "observability|monitoring|microservices|distributed systems|system design|event-driven|serverless|Lambda|S3|EC2|data pipelines|"
         "data modeling|data analysis|data visualization|machine learning|deep learning|PyTorch|TensorFlow|scikit-learn|pandas|NumPy|LLM|"
         "RAG|LangChain|NLP|computer vision|MLOps|A/B testing|statistics|unit testing|integration testing|test automation|Selenium|Cypress|"
         "Jest|Playwright|accessibility|performance optimization|code reviews|mentoring|agile|Scrum|Jira|documentation|security|HIPAA|SOC 2|"
         "PCI|payments|billing|incident response|on-call|SaaS|iOS|Android|React Native|Flutter|Figma|product management|stakeholder management")
TERMS = [t.replace("\\", "") for t in VOCAB.split("|")]
DOMAINS = [  # "AI" is matched case-sensitively via AMBIGUOUS
   "healthcare", "payments", "fintech", "finance", "banking", "insurance", "retail", "e-commerce", "marketplace", "logistics",
           "education", "security", "infrastructure", "cloud", "AI", "machine learning", "data", "SaaS", "gaming", "media", "advertising"]
CATEGORIES = [
    ("Languages", {"java", "python", "typescript", "javascript", "golang", "go", "kotlin", "swift", "objective-c", "c++", "c#", "ruby", "rust",
                   "scala", "php", "sql", "bash", "html", "css", "r"}),
    ("Frameworks & Libraries", {"react", "spring boot", "spring", "fastapi", "django", "flask", "rails", "angular", "vue", "svelte", "node.js",
                                "next.js", "express", ".net", "hibernate", "pytorch", "tensorflow", "scikit-learn", "pandas", "numpy", "langchain",
                                "react native", "flutter", "tailwind", "jest", "cypress", "playwright", "selenium"}),
    ("Cloud & DevOps", {"aws", "azure", "gcp", "google cloud", "kubernetes", "docker", "terraform", "ansible", "jenkins", "github actions",
                        "ci/cd", "linux", "git", "lambda", "s3", "ec2", "grafana", "prometheus", "datadog", "cloudwatch", "splunk"}),
    ("Data & Messaging", {"postgresql", "mysql", "sql server", "mongodb", "dynamodb", "cassandra", "redis", "elasticsearch", "kafka", "rabbitmq",
                          "snowflake", "bigquery", "databricks", "redshift", "spark", "hadoop", "airflow", "apache airflow", "dbt", "etl",
                          "tableau", "power bi", "looker", "excel", "temporal"}),
]
HEADINGS = [(re.compile(r"prefer|nice.to.have|bonus|pluses|\bplus\b", re.I), "preferred"),
            (re.compile(r"requir|qualif|must.have|you have|you bring|minimum|what you.ll need|skills", re.I), "required"),
            (re.compile(r"responsib|you will|you.ll do|the role|day.to.day|what you.ll", re.I), "responsibility")]
TIGHTEN = [(r"\bin order to\b", "to"), (r"\bwith the goal of\b", "to"), (r"\bthrough the use of\b", "using"), (r"\butiliz(e|ed|ing)\b", r"us\1"),
           (r"\bon a daily basis\b", "daily"), (r"\ba number of\b", "several"), (r"^(?:was )?responsible for developing\b", "Developed"),
           (r"^(?:was )?responsible for implementing\b", "Implemented"), (r"^(?:was )?responsible for building\b", "Built"),
           (r"^(?:was )?responsible for managing\b", "Managed"), (r"^(?:was )?responsible for designing\b", "Designed"), (r"^helped to\b", "Helped")]


AMBIGUOUS = {"Go", "REST", "Spring", "Lambda", "Rust", "Swift", "Express", "Ruby", "Excel", "Git", "Vue", "AI", "Flutter", "Looker", "monitoring"}


def mentions(text, term):
    """Case-sensitive for words that are also ordinary English ("go live", "swift delivery")."""
    if term in AMBIGUOUS:
        return bool(re.search(rf"(?<![\w]){re.escape(term)}(?![\w])", text))
    if has(text, term):
        return True
    root = term[:-3] if term.endswith("ing") and " " not in term and len(term) > 6 else ""
    return bool(root) and bool(re.search(rf"\b{re.escape(root)}(?:e?[ds]|ing|s)?\b", text, re.I))  # "mentoring" finds "Mentored"


def terms_in(text):
    found = [t for t in TERMS if mentions(text, t)]
    return [t for t in found if not any(t != o and has(o, t) and len(o) > len(t) for o in found)]  # "Spring Boot" beats "Spring"


def analyze(rows, jd, company="", title=""):
    kind, reqs, seen = "responsibility", [], set()
    for raw in jd.splitlines():
        line = raw.strip(" \t•*-–·")
        if not line:
            continue
        if len(line) < 70 and not line.endswith("."):
            kind = next((k for rx, k in HEADINGS if rx.search(line)), kind)
        for term in terms_in(line):
            if term.lower() in seen:
                continue
            seen.add(term.lower())
            proof = [r for r in rows if r["kind"] in ("bullet", "text") and mentions(r["text"], term)]
            in_work = [r for r in proof if r["kind"] == "bullet"]
            status = "supported" if in_work else "transferable" if proof else "unsupported"
            reqs.append(dict(id=f"q{len(reqs) + 1}", text=line if len(line) <= 110 else line[:107] + "…", type=kind, keywords=[term],
                             status=status, evidence=[r["id"] for r in (in_work or proof)][:3],
                             note={"supported": f"Shown in your experience: {(in_work or [{'group': ''}])[0]['group'] or 'resume'}.",
                                   "transferable": f"{term} is listed on your resume but not shown in an achievement.",
                                   "unsupported": f"{term} does not appear on your resume."}[status]))
    found_company = company or next((m.group(1).strip() for m in [re.search(r"^\s*company\s*:\s*(.+)$", jd, re.I | re.M)] if m), "")
    first = next((l.strip() for l in jd.splitlines() if l.strip()), "")
    level = re.search(r"\b(intern|junior|staff|principal|senior|lead)\b", title + " " + jd[:400], re.I)
    seniority = {"intern": "intern", "junior": "junior", "staff": "staff+", "principal": "staff+", "senior": "senior", "lead": "senior"}[
        level.group(1).lower()] if level else "unknown"
    summary = next((s.strip() for s in re.split(r"(?<=[.!?])\s+", jd) if len(s.strip()) > 50), "")[:220]
    return dict(company=found_company, title=title or (first if len(first) < 80 else ""), seniority=seniority,
                domain=[d for d in DOMAINS if mentions(jd, d)][:4], role_summary=summary, requirements=reqs[:24])


def tighten(text, terms):
    out = text
    for pattern, repl in TIGHTEN:
        out = re.sub(pattern, repl, out, flags=re.I)
    for t in terms:  # use the posting's exact spelling of a term the bullet already contains (exact-match ATS)
        out = re.sub(rf"(?<![\w.]){re.escape(t)}(?![\w])", t, out, flags=re.I)
    return out[:1].upper() + out[1:]


def tailor(rows, reqs, level, title):
    proven = [r for r in reqs if r["status"] != "unsupported"]
    def hits(text): return [r for r in proven if any(mentions(text, k) for k in r["keywords"])]
    bullets = [r for r in rows if r["kind"] == "bullet"]
    order = [r["id"] for r in sorted(bullets, key=lambda r: -len(hits(r["text"])))]
    edits, drop = [], []
    if level != "basic":
        for r in bullets:
            matched = hits(r["text"])
            if level == "medium" and not matched:
                continue
            new = tighten(r["text"], [k for q in matched for k in q["keywords"]])
            if new != r["text"]:
                edits.append(dict(id=r["id"], text=new, requirements=[q["id"] for q in matched],
                                  reason="Tighter wording" + (f"; uses the posting's spelling of {', '.join(k for q in matched for k in q['keywords'])}." if matched else ".")))
    if level == "aggressive":
        for group in dict.fromkeys(r["group"] for r in bullets):
            ranked = [i for i in order if next(b for b in bullets if b["id"] == i)["group"] == group]
            drop += [i for i in ranked[2:] if not hits(next(b for b in bullets if b["id"] == i)["text"])]
    summary = ""
    lines = [r["text"] for r in rows if r["kind"] == "text" and SUMMARY.search(r["section"])]
    if level != "basic" and lines:
        sentences = re.findall(r"[^.!?]+[.!?]*", " ".join(lines))
        rest = sorted(sentences[1:], key=lambda s: -len(hits(s)))
        summary = " ".join(s.strip() for s in [sentences[0], *rest[:3]] if s.strip())
    skills = []
    skill_text = [r["text"] for r in rows if r["kind"] in ("text", "bullet") and SKILLS.search(r["section"])]
    if skill_text:
        items = list(dict.fromkeys(i.strip() for t in skill_text for i in re.split(r"[,;|•]", re.sub(r"^[^:]{1,30}:", "", t)) if i.strip()))
        wanted = {k.lower() for q in proven for k in q["keywords"]}
        items.sort(key=lambda s: s.lower() not in wanted)
        groups = {name: [i for i in items if i.lower() in members] for name, members in CATEGORIES}
        other = [i for i in items if not any(i in g for g in groups.values())]
        skills = [dict(category=n, items=g) for n, g in [*groups.items(), ("Other", other)] if g]
    gaps = [r for r in reqs if r["status"] == "unsupported" and r["type"] == "required"]
    verification = [f"Required but not on your resume: {', '.join(k for r in gaps for k in r['keywords'])}. Address it in your cover letter or interview."] if gaps else []
    verification.append("Offline engine: changes are reordering and light wording fixes. Add an API key for full Claude tailoring.")
    return dict(title=title, summary=summary, skills=skills, edits=edits, additions=[], order=order, drop=drop, verification=verification, evidence_ledger=[])
