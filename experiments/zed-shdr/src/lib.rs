use zed_extension_api as zed;

struct ShdrExtension;

impl zed::Extension for ShdrExtension {
    fn new() -> Self {
        Self
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &zed::LanguageServerId,
        worktree: &zed::Worktree,
    ) -> zed::Result<zed::Command> {
        // This is a repo-local feasibility spike, not a distributable LSP.
        let manifest = worktree
            .read_text_file("package.json")
            .map_err(|_| "Open apps/editor-fixture as the Zed workspace".to_string())?;
        if !manifest.contains("@shdr/editor-fixture") {
            return Err("Open apps/editor-fixture as the Zed workspace".to_string());
        }

        let node = match worktree.which("node") {
            Some(node) => node,
            None => zed::node_binary_path()?,
        };
        Ok(zed::Command {
            command: node,
            args: vec![format!(
                "{}/../../packages/lsp/dist/bin.mjs",
                worktree.root_path()
            )],
            env: Default::default(),
        })
    }
}

zed::register_extension!(ShdrExtension);
