mod hostlink;
mod kv_link;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .manage(kv_link::KvLinkState::default())
    .invoke_handler(tauri::generate_handler![
      kv_link::kv_connect,
      kv_link::kv_disconnect,
      kv_link::kv_set_watch,
      kv_link::kv_write_bit,
      kv_link::kv_write_word,
      kv_link::kv_raw_command,
    ])
    .setup(|app| {
      //NewWindowPortalはwindow.open('')で開いた空ウィンドウに同じReactツリーをポータル描画するため、
      //Tauri既定(window.openを拒否)ではなくWebView2標準のポップアップとして開かせ、openerとの関係を保つ。
      //about:blank以外(外部URL等)は従来どおり拒否する
      let config = app.config().app.windows[0].clone();
      tauri::WebviewWindowBuilder::from_config(app.handle(), &config)?
        .on_new_window(|url, _features| {
          if url.as_str() == "about:blank" {
            tauri::webview::NewWindowResponse::Allow
          } else {
            tauri::webview::NewWindowResponse::Deny
          }
        })
        .build()?;

      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }
      Ok(())
    })
    .run(tauri::generate_context!())
    .expect("error while running tauri application");
}
