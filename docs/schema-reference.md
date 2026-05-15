# Schema Reference

> **Not affiliated with or endorsed by SurveyJS / Devsoft Baltic OÜ.**

Survey Engine stores survey definitions as **SurveyJS-native JSON**. The same schema object you pass to `new Survey.Model(schema)` on the frontend is stored verbatim by the API.

---

## Minimal survey

```json
{
  "pages": [
    {
      "name": "page1",
      "elements": [
        {
          "name": "q1",
          "type": "text",
          "title": "What is your name?"
        }
      ]
    }
  ]
}
```

---

## Page object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique page identifier (used in logic rules) |
| `title` | string | No | Display title |
| `description` | string | No | Subtitle / helper text |
| `elements` | Question[] | Yes | Questions on this page |

Both `name`/`elements` (SurveyJS) and `id`/`questions` (internal format) are accepted.

---

## Question object

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Unique question identifier |
| `type` | string | Yes | Question type (see below) |
| `title` | string | No | Display label |
| `isRequired` | boolean | No | Whether an answer is mandatory |
| `choices` | Choice[] | For choice types | Array of selectable options |
| `rateMin` / `rateMax` | number | For rating | Scale range |
| `rows` / `columns` | MatrixItem[] | For matrix | Row and column definitions |
| `validators` | Validator[] | No | SurveyJS validator array |

---

## Supported question types

All SurveyJS types are accepted and stored as-is. The following are explicitly recognised and validated:

| Type | Notes |
|------|-------|
| `text` | Single-line input |
| `comment` | Multi-line textarea |
| `radiogroup` | Single choice from list |
| `checkbox` | Multiple choice from list |
| `dropdown` | Single choice in a dropdown |
| `rating` | Star/numeric rating |
| `boolean` | Yes/No toggle |
| `matrix` | Grid of radio buttons |
| `matrixdropdown` | Grid of dropdowns |
| `ranking` | Drag-to-rank |
| `file` | File upload |
| `signaturepad` | Signature capture |
| `expression` | Calculated/display value |
| `html` | Static HTML block |

Unknown types emit a warning from the schema validator but are still stored and served, allowing you to use any future SurveyJS type.

---

## Built-in SurveyJS conditional logic (recommended)

SurveyJS has its own expression language built directly into the schema — `visibleIf`, `enableIf`, `requiredIf`, `triggers`, etc. These are stored inside `schemaJson` and evaluated by SurveyJS in the browser with zero extra configuration:

```json
{
  "name": "reason",
  "type": "comment",
  "title": "Why did you give that score?",
  "visibleIf": "{score} <= 6"
}
```

**This is the recommended approach for most teams.** You need nothing else from survey-engine to make conditional logic work.

---

## Logic schema (advanced — optional)

The `logicJson` field is an **optional** server-side rule engine for use cases where you need to evaluate survey logic *without a browser*: bots, API integrations, server-rendered flows, or pre-validating answers before storage.

If you are building a standard SurveyJS frontend, you likely do not need this.

`logicJson` is stored separately from `schemaJson` and evaluated via:
- `GET /surveys/:id/validate` — validate rules reference real question IDs
- `POST /surveys/:id/evaluate-logic` — evaluate rules against a set of answers
- `GET /responses/:id/logic` — evaluate rules against a stored response's current answers

```json
{
  "version": "1.0",
  "rules": [
    {
      "id": "show-reason",
      "condition": {
        "questionId": "score",
        "operator": "lt",
        "value": 7
      },
      "action": {
        "type": "visibility",
        "targetId": "reason",
        "targetType": "question"
      }
    }
  ]
}
```

### Condition operators

| Operator | Description |
|----------|-------------|
| `eq` | Equals |
| `neq` | Not equals |
| `gt` / `gte` | Greater than / or equal |
| `lt` / `lte` | Less than / or equal |
| `contains` / `not_contains` | String contains |
| `starts_with` / `ends_with` | String prefix / suffix |
| `is_empty` / `is_not_empty` | Blank check |
| `in` / `not_in` | Array membership |
| `matches` | Regular expression |

### Compound conditions (AND / OR)

```json
{
  "operator": "and",
  "conditions": [
    { "questionId": "country", "operator": "eq", "value": "US" },
    { "questionId": "age", "operator": "gte", "value": 18 }
  ]
}
```

### Rule action types

| Type | Effect |
|------|--------|
| `visibility` | Show/hide a question or page when condition is met |
| `required` | Make a question required when condition is met |
| `calculated` | Set a computed value |
| `validation` | Custom validation message |
| `jump` | Jump to a specific page |

---

## Publishing and versioning

When you call `POST /surveys/:id/publish`, the current `draftSchemaJson` and `draftLogicJson` are:

1. Validated (errors block publish)
2. Deep-cloned and stored as an immutable `SurveyVersion`
3. SHA-256 checksummed for integrity

After publishing you can continue editing the draft. Respondents always load `GET /surveys/:id/runtime` which returns the latest published version — they never see draft changes.

---

## Answers format

Responses store answers as a flat JSON object keyed by question `name`:

```json
{
  "score": 8,
  "reason": "Great onboarding experience",
  "country": "US"
}
```

For matrix questions the value is a nested object `{ "rowId": "columnValue" }`. For checkbox the value is an array `["option1", "option2"]`.
