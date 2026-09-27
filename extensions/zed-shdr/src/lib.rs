use std::path::{Path, PathBuf};
use zed_extension_api as zed;

struct ShdrExtension;

fn launcher_path(root: &Path) -> PathBuf {
    root.join("extensions/zed-shdr/launch-lsp.cjs")
}

fn repository_root(worktree_path: &str, manifest: &str) -> Result<PathBuf, String> {
    let worktree = Path::new(worktree_path);
    let package: serde_json::Value = serde_json::from_str(manifest)
        .map_err(|_| "Cannot read this worktree's package.json".to_string())?;
    if package["name"] == "shader-dsl" {
        return Ok(worktree.to_path_buf());
    }
    if package["name"] == "@shdr/editor-fixture" {
        return worktree
            .parent()
            .and_then(Path::parent)
            .map(Path::to_path_buf)
            .ok_or_else(|| "Cannot locate the repository above apps/editor-fixture".to_string());
    }
    Err("Open the shader-dsl repository or its apps/editor-fixture worktree".to_string())
}

impl zed::Extension for ShdrExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        let manifest = worktree.read_text_file("package.json").map_err(|_| {
            "Open the shader-dsl repository or its apps/editor-fixture worktree".to_string()
        })?;
        let root = repository_root(&worktree.root_path(), &manifest)?;
        let node = match worktree.which("node") {
            Some(node) => node,
            None => zed::node_binary_path()?,
        };
        Ok(zed::Command {
            command: node,
            // Node performs the host-filesystem artifact check; Wasm cannot
            // assume read access outside the active worktree.
            args: vec![
                launcher_path(&root).to_string_lossy().into_owned(),
                root.to_string_lossy().into_owned(),
            ],
            env: Default::default(),
        })
    }
}

zed::register_extension!(ShdrExtension);

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_both_supported_worktrees_to_the_same_repository() {
        let root = "/tmp/shader-dsl";
        assert_eq!(
            repository_root(root, r#"{"name":"shader-dsl"}"#).unwrap(),
            Path::new(root)
        );
        assert_eq!(
            launcher_path(Path::new(root)),
            Path::new(root).join("extensions/zed-shdr/launch-lsp.cjs")
        );
        assert_eq!(
            repository_root(
                "/tmp/shader-dsl/apps/editor-fixture",
                r#"{"name": "@shdr/editor-fixture"}"#
            )
            .unwrap(),
            Path::new(root)
        );
    }

    #[test]
    fn refuses_unrelated_worktrees() {
        assert!(repository_root("/tmp/other", r#"{"name": "other"}"#).is_err());
        assert!(repository_root("/tmp/other", "not-json").is_err());
    }
}
