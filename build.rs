// Embeds everything under web/ into the binary.
use std::{env, fs, path::Path};

fn walk(dir: &Path, base: &Path, out: &mut Vec<String>) {
    let mut entries: Vec<_> = fs::read_dir(dir).expect("web dir").flatten().collect();
    entries.sort_by_key(|e| e.path());
    for e in entries {
        let p = e.path();
        if p.is_dir() {
            walk(&p, base, out);
        } else {
            let rel = p
                .strip_prefix(base)
                .unwrap()
                .to_string_lossy()
                .replace('\\', "/");
            let mime = match p.extension().and_then(|x| x.to_str()).unwrap_or("") {
                "html" => "text/html; charset=utf-8",
                "js" => "text/javascript; charset=utf-8",
                "css" => "text/css; charset=utf-8",
                "svg" => "image/svg+xml",
                "png" => "image/png",
                "ico" => "image/x-icon",
                "json" | "webmanifest" => "application/manifest+json",
                "woff2" => "font/woff2",
                _ => "application/octet-stream",
            };
            let abs = fs::canonicalize(&p).unwrap();
            out.push(format!(
                "    ({:?}, include_bytes!({:?}), {:?}),",
                rel,
                abs.to_string_lossy(),
                mime
            ));
        }
    }
}

fn main() {
    let web = Path::new("web");
    println!("cargo:rerun-if-changed=web");
    let mut entries = Vec::new();
    walk(web, web, &mut entries);
    let code = format!(
        "pub static ASSETS: &[(&str, &[u8], &str)] = &[\n{}\n];\n",
        entries.join("\n")
    );
    fs::write(
        Path::new(&env::var("OUT_DIR").unwrap()).join("assets.rs"),
        code,
    )
    .unwrap();
}
