//! Shared helpers for the crate's SOURCE guards (tests that read the crate's own text or parse it
//! with `syn`). Test-only: declared `#[cfg(test)]` in `lib.rs`, and included by path from
//! `tests/sync_commands_do_not_block.rs`, so it uses nothing from the crate (`crate::` would not
//! resolve there) and nothing outside `std` and `syn`.
//!
//! One rule per question, tested once here, instead of one hand-copied variant per guard. The
//! copies this replaced cut "production" at three different markers and matched different
//! `syn::Item` variants; one of them cut at the wrong place and failed on a clean tree
//! (`SURFACE-2026-11-17-QUALITY-M17WP5-DENSE-BODY-HELPERS-TRIPLICATED`,
//! `SURFACE-2026-11-20-QUALITY-CFG-TEST-FENCE-HAND-COPIED`).

/// The production half of a module's source: everything before its `#[cfg(test)] mod tests`.
///
/// ⚠️ Cut at the TEST MODULE, never at the first `#[cfg(test)]`: a test-only helper item can sit
/// above production code (`remote_link/commands.rs` has one), and cutting there hides everything
/// after it. A file with no inline test module at all is production through to its end. But a
/// test module under ANOTHER name panics, so a rename fails loudly instead of silently scanning
/// the tests as production.
pub fn production_text(src: &str) -> &str {
    if let Some(at) = src.find("\n#[cfg(test)]\nmod tests") {
        return &src[..at];
    }
    assert!(
        !src.contains("\n#[cfg(test)]\nmod "),
        "a `#[cfg(test)]` module not named `tests` in this source; re-scope the guard"
    );
    src
}

/// `text` without its `//` comment lines (doc comments included). Code lines are kept whole.
pub fn without_comment_lines(text: &str) -> String {
    text.lines()
        .filter(|l| !l.trim_start().starts_with("//"))
        .collect::<Vec<_>>()
        .join("\n")
}

/// `text` with every whitespace character removed, so a `cargo fmt` reflow can neither break nor
/// satisfy a guard over it.
pub fn dense(text: &str) -> String {
    text.chars().filter(|c| !c.is_whitespace()).collect()
}

/// The span of `production` from `sig` up to (not including) the first `until` after it.
pub fn span<'a>(production: &'a str, sig: &str, until: &str) -> &'a str {
    let start = production
        .find(sig)
        .unwrap_or_else(|| panic!("{sig:?} moved; re-scope this guard"));
    let body = &production[start..];
    let end = body
        .find(until)
        .unwrap_or_else(|| panic!("{sig:?} is not followed by {until:?}"));
    &body[..end]
}

/// A TOP-LEVEL fn's production body (from `sig` to its column-0 `}`), comments dropped, dense.
pub fn dense_production_fn(src: &str, sig: &str) -> String {
    dense(&without_comment_lines(span(
        production_text(src),
        sig,
        "\n}\n",
    )))
}

/// Whether an item is compiled ONLY under test: `#[cfg(test)]`, or `#[cfg(all(test, …))]`.
///
/// ⚠️ Parsed, not tokenized. Matching any `test` token would drop `#[cfg(not(test))]` and
/// `#[cfg(any(test, …))]` items, which are production code.
pub fn is_cfg_test(attrs: &[syn::Attribute]) -> bool {
    attrs.iter().any(|a| {
        a.path().is_ident("cfg")
            && a.parse_args::<syn::Meta>()
                .is_ok_and(|m| cfg_is_test_only(&m))
    })
}

fn cfg_is_test_only(meta: &syn::Meta) -> bool {
    match meta {
        syn::Meta::Path(p) => p.is_ident("test"),
        syn::Meta::List(l) if l.path.is_ident("all") => l
            .parse_args_with(
                syn::punctuated::Punctuated::<syn::Meta, syn::Token![,]>::parse_terminated,
            )
            .is_ok_and(|parts| parts.iter().any(cfg_is_test_only)),
        _ => false,
    }
}

/// An item's attributes, for EVERY `syn::Item` variant that carries them (a match that lists only
/// some variants silently treats the rest as attribute-free, so their `#[cfg(test)]` is missed).
pub fn item_attrs(item: &syn::Item) -> &[syn::Attribute] {
    use syn::Item;
    match item {
        Item::Const(i) => &i.attrs,
        Item::Enum(i) => &i.attrs,
        Item::ExternCrate(i) => &i.attrs,
        Item::Fn(i) => &i.attrs,
        Item::ForeignMod(i) => &i.attrs,
        Item::Impl(i) => &i.attrs,
        Item::Macro(i) => &i.attrs,
        Item::Mod(i) => &i.attrs,
        Item::Static(i) => &i.attrs,
        Item::Struct(i) => &i.attrs,
        Item::Trait(i) => &i.attrs,
        Item::TraitAlias(i) => &i.attrs,
        Item::Type(i) => &i.attrs,
        Item::Union(i) => &i.attrs,
        Item::Use(i) => &i.attrs,
        // `Verbatim` (unparsed tokens) has no attributes; `Item` is non-exhaustive.
        _ => &[],
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn production_is_cut_at_the_test_module_not_at_the_first_cfg_test() {
        let src =
            "fn a() {}\n#[cfg(test)]\nfn helper() {}\nfn b() {}\n#[cfg(test)]\nmod tests {}\n";
        let p = production_text(src);
        assert!(p.contains("fn b()"), "{p}");
        assert!(!p.contains("mod tests"), "{p}");
    }

    #[test]
    fn a_file_without_a_test_module_is_production_to_its_end() {
        assert_eq!(production_text("fn a() {}\n"), "fn a() {}\n");
    }

    #[test]
    #[should_panic(expected = "not named `tests`")]
    fn a_renamed_test_module_fails_loudly() {
        production_text("fn a() {}\n#[cfg(test)]\nmod checks {}\n");
    }

    #[test]
    fn a_top_level_fn_body_is_dense_and_comment_free() {
        let src = "fn x() {\n    // gone\n    let  a = 1;\n    if a { b(); }\n}\nfn y() {}\n#[cfg(test)]\nmod tests {}\n";
        assert_eq!(dense_production_fn(src, "fn x()"), "fnx(){leta=1;ifa{b();}");
    }

    #[test]
    fn cfg_test_is_recognized_in_its_test_only_forms_only() {
        let attrs = |s: &str| {
            syn::parse_str::<syn::ItemFn>(&format!("{s} fn f() {{}}"))
                .unwrap()
                .attrs
        };
        assert!(is_cfg_test(&attrs("#[cfg(test)]")));
        assert!(is_cfg_test(&attrs("#[cfg(all(test, unix))]")));
        assert!(!is_cfg_test(&attrs("#[cfg(not(test))]")));
        assert!(!is_cfg_test(&attrs("#[cfg(any(test, unix))]")));
        assert!(!is_cfg_test(&attrs("#[cfg(unix)]")));
    }

    #[test]
    fn item_attrs_reaches_the_variants_the_old_copies_skipped() {
        for src in [
            "#[cfg(test)] const C: u8 = 0;",
            "#[cfg(test)] struct S;",
            "#[cfg(test)] enum E { A }",
            "#[cfg(test)] static X: u8 = 0;",
            "#[cfg(test)] type T = u8;",
            "#[cfg(test)] trait Tr {}",
            "#[cfg(test)] macro_rules! m { () => {} }",
        ] {
            let item: syn::Item = syn::parse_str(src).unwrap();
            assert!(is_cfg_test(item_attrs(&item)), "{src}");
        }
    }
}
