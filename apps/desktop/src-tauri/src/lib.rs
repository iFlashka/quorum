mod keychain;
mod tray;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Нативная инфраструктура.
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            // Если бинарь стартует системой (autostart) — добавляем флаг
            // `--minimized` чтобы клиент сразу ушёл в трей.
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .invoke_handler(tauri::generate_handler![
            keychain::keychain_set,
            keychain::keychain_get,
            keychain::keychain_delete,
            tray::set_unread_count,
            tray::set_mute_state,
            tray::get_mute_state,
        ])
        .on_window_event(|window, event| {
            if window.label() == "main" {
                tray::on_main_window_event(event, window);
            }
        })
        .setup(|app| {
            tray::setup(app.handle())?;

            // --minimized → не показывать главное окно. Без флага — окно
            // покажет себя само (начальное состояние из tauri.conf.json).
            let started_minimized = std::env::args().any(|arg| arg == "--minimized");
            if started_minimized {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.hide();
                }
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
