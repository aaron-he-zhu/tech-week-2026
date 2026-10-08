# Content inputs

This public repository contains source code and fictional examples. Production content belongs in a separate, access-controlled checkout. Set `TECH_WEEK_CONTENT_DIR` to its absolute root; without this variable the build uses `examples/demo/`. The directory is a trusted build input, never a visitor-supplied upload.

The demo is the executable reference for this layout:

| Relative path inside the content root        | Purpose                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `data/sf_events.json`, `data/la_events.json` | Event records with stable UUIDs, city, dates, times, names, hosts and source URLs           |
| `website/src/snapshot.json`                  | Counts, checked timestamp, and `detail_source` path relative to the content root            |
| `website/src/topic_membership.json`          | Membership keyed by public topic slug, then event ID, with score, terms and source evidence |
| `website/src/locales/en.json`                | English translations for content-specific copy                                              |
| `website/src/refresh.json`                   | New, removed and changed records; see the demo's empty change set                           |
| `website/src/briefs.json`                    | Optional editorial briefs                                                                   |
| `website/src/luma_links.json`                | Optional matched Luma links                                                                 |
| `website/src/system_one_review.json`         | Optional review notes for Agent Harness                                                     |
| `Tech_Week_2026_SF_LA_完整清单.csv`          | Source event export                                                                         |
| `website/public/downloads/changes.csv`       | Source change export                                                                        |

The snapshot's `detail_source` must resolve inside the content root. Required files fail closed when missing. The demo sets `demo: true`; production content omits it or sets it to false. Production checks additionally retain the existing guide's taxonomy regression snapshots under `data/system_one_audit/` and `data/taxonomy_before_memory_merge/`. Adapting this guide to a different calendar requires adapting those editorial assertions, not falsely marking real data as demo.

UI translations live in `website/src/locales/en.json`; content-specific translations are overlaid at build time. Both languages share source IDs, dates, taxonomy and counts. CSV output sanitizes spreadsheet formula prefixes in either language.

Public pull requests validate only the fictional dataset. The optional production job checks out the private dataset at an explicitly configured immutable revision using a read-only, repository-scoped deploy key. It does not publish that checkout or use visitor records for testing. A content refresh requires updating and reviewing that pinned revision; normal website requests and community updates do not run the build.

Do not commit external snapshots to this public repository. See [source notices](../NOTICE.md) before importing data.
