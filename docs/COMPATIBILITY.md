# Claude Code compatibility

Which Claude Code version this marketplace needs, and the reason behind every
floor. Three different audiences have three different floors, because the
features they each depend on landed in three different releases.

| Audience | Claude Code | Binding feature |
| -------- | ----------- | --------------- |
| **Users** installing from the published marketplace | **>= 2.1.143** | coordinated enable/disable of dependencies; `displayName` in the manifest |
| **Contributors** running the local-folder check | **>= 2.1.196** | tag resolution for a marketplace added as a local folder |
| **Maintainers** running `claude plugin validate . --strict` | **>= 2.1.222** | `metadata` recognised as a manifest field |

A floor is the maximum over the features actually relied on, so each row lists
only the newest requirement. Everything below the row's version is satisfied by
older releases.

## Users: >= 2.1.143

Two plugins declare dependencies — `sdd-engineering` on all three others,
`architecture-review` on `engineering-paved-path` (see
[DEPENDENCIES.md](DEPENDENCIES.md)). The documented requirement for the
enable/disable half of that machinery is:

> Enabling a plugin also enables the plugins it depends on, and disabling a
> plugin is blocked if another enabled plugin still needs it. Both behaviors
> require Claude Code v2.1.143 or later. Earlier versions enable or disable only
> the named plugin and surface a `dependency-unsatisfied` error on the next load.

The same version is the floor for `displayName`, which **all four** manifests
set and which the authoring rules in `CLAUDE.md` require. Below 2.1.143 the
field is ignored and the `/plugin` picker falls back to `name`.

Resolution itself — a `^1.0.0` range fetched at the highest `<plugin>--v<version>`
git tag — works on older releases from a git-backed marketplace source, which is
how the public install path works:

```
/plugin marketplace add SyukPublic/ai-dev-toolkit
/plugin install sdd-engineering@ai-dev-toolkit
```

What that path does need is the fix from **2.1.110** — "plugin install not
honoring dependencies declared in `plugin.json` when the marketplace entry omits
them". This repository declares dependencies **only** in each plugin's manifest;
[marketplace.json](../.claude-plugin/marketplace.json) deliberately does not
repeat them. Diagnostics for the failure modes (`range-conflict`,
`dependency-version-unsatisfied`, `no-matching-tag`) arrived across 2.1.111–2.1.118.
All of that is below 2.1.143, so it does not move the floor.

## Contributors: >= 2.1.196

[CONTRIBUTING.md](../CONTRIBUTING.md) requires a local end-to-end check before a
PR, from the repo root:

```
/plugin marketplace add ./
/plugin install <plugin-name>@ai-dev-toolkit
```

That is a local-folder marketplace source, and for it:

> A marketplace added as a local folder path resolves tags the same way when the
> folder is a git repository. This requires Claude Code v2.1.196 or later. In two
> cases Claude Code installs the dependency from the folder's current contents
> instead: earlier versions don't read tags from a local-folder marketplace, so a
> constrained dependency loads only if that copy satisfies the range; a local
> folder that isn't a git repository has no tags, regardless of version.

Below 2.1.196 the check does not fail outright — the working tree satisfies every
declared range today, so the install succeeds. What is lost is **fidelity**: the
dependency comes from the working tree instead of the highest matching tag, so
the local check stops exercising the resolution path real users get. A range that
the working tree happens to satisfy while the tags do not (or the reverse) would
pass locally and break after publication. That is the reason this floor is
higher than the user floor, and the reason to state it separately rather than
merge the two.

## Maintainers: >= 2.1.222

Every manifest carries the floor declaratively:

```json
"metadata": { "minClaudeCodeVersion": "2.1.143" }
```

`metadata` is the manifest's designated free-form object — Claude Code never
reads it, so the value cannot affect plugin behaviour. But the key itself was
only recognised in **2.1.222**; before that it was treated as an unrecognized
field, which `claude plugin validate` reports as a warning and `--strict`
promotes to an error. Measured on 2.1.220:

```
⚠ plugins[1] plugin.json → metadata: Unknown field 'metadata'.
✘ Validation failed (--strict treats warnings as errors)
```

So the repo-wide check documented in `CLAUDE.md` needs 2.1.222 or newer:

```bash
claude plugin validate . --strict
```

CI installs `@anthropic-ai/claude-code` unpinned
([validate.yml](../.github/workflows/validate.yml)), so it is always above the
floor. A local run on an older CLI reports exactly one warning per manifest, and
that warning is a stale-CLI artifact, not a manifest defect.

This affects authors only. An unrecognized top-level field is ignored at load
time, so a plugin installed on a pre-2.1.222 CLI loads normally and the user
floor stays 2.1.143.

## Nothing enforces this

There is no `engines`, `requiresClaudeCode`, or minimum-version field in the
plugin manifest schema. `metadata.minClaudeCodeVersion` is documentation that
travels with the payload — no validator checks it and no install is gated on it.
Below the user floor the degradation is quiet:

| Below | Symptom |
| ----- | ------- |
| 2.1.143 | `displayName` ignored; `enable` does not cascade to dependencies and `disable` is not refused, so a plugin can be left with `dependency-unsatisfied` on the next load |
| 2.1.196 | local-folder installs resolve the working tree instead of tags (contributors only) |
| 2.1.110 | dependencies declared only in `plugin.json` are not installed at all |

## Features deliberately not depended on

Checked and left unused, so they do not raise any floor:

| Feature | Floor it would add |
| ------- | ------------------ |
| `defaultEnabled` in a manifest or marketplace entry | 2.1.154 |
| automatic migration through a marketplace `renames` map | 2.1.193 — becomes relevant only if a plugin is ever renamed (see [RELEASES.md](RELEASES.md)) |
| `npm` and `archive` marketplace sources | 2.1.224 for `archive`; both irrelevant to a git-backed marketplace |

Two things that carry no documented floor and are used freely: an agent's
`skills:` frontmatter (preloading skill content at spawn time) and
`metadata.pluginRoot` in `marketplace.json`.

## Moving a floor

A version in prose goes stale, which is why [DEPENDENCIES.md](DEPENDENCIES.md)
keeps plugin versions out of its text. This file is the deliberate exception:
these are **Claude Code** versions, not plugin versions, and they move only when
this repository starts relying on a newer feature — never on a release of its
own.

When that happens: name the feature and quote the requirement from the official
docs or the changelog entry that introduced it, update the table above, and
update `metadata.minClaudeCodeVersion` in every manifest whose users are
affected. A floor without a named binding feature is a guess, not a requirement.
