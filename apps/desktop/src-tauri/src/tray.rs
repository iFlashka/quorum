//! System tray для Quorum.
//!
//! - Левый клик / двойной клик → показать-сфокусировать главное окно.
//! - Меню: Open / Mute notifications (toggle) / Quit.
//! - close-to-tray: закрытие главного окна прячет его, а не выходит.
//! - Unread badge: `apply_unread(count)` подменяет иконку и tooltip;
//!   фронт зовёт это через #[tauri::command] set_unread_count.

use serde::Serialize;
use std::sync::Mutex;
use tauri::{
    image::Image,
    menu::{CheckMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, Runtime, State, WindowEvent, Wry,
};

const TRAY_ID: &str = "main-tray";
const MENU_ID_OPEN: &str = "open";
const MENU_ID_MUTE: &str = "mute";
const MENU_ID_QUIT: &str = "quit";

/// Эмитится в JS когда пользователь меняет mute через tray. Фронт переключает
/// свой store и зеркалит обратно в Rust командой `set_mute_state`.
const EVENT_MUTE_TOGGLED: &str = "tray://mute-toggled";

const ICON_DEFAULT_BYTES: &[u8] = include_bytes!("../icons/32x32.png");
const ICON_UNREAD_BYTES: &[u8] = include_bytes!("../icons/tray-unread.png");

/// State, который держится в Rust и читается tray-иконкой.
/// Использует конкретный `Wry`-рантайм, потому что наш бинарь только Wry,
/// а managed state требует конкретного типа.
pub struct TrayState {
    pub muted: Mutex<bool>,
    pub unread: Mutex<u32>,
    /// Хэндл на чекбокс «Без уведомлений» — чтобы синкать его при смене из JS.
    pub mute_item: Mutex<Option<CheckMenuItem<Wry>>>,
}

impl Default for TrayState {
    fn default() -> Self {
        Self {
            muted: Mutex::new(false),
            unread: Mutex::new(0),
            mute_item: Mutex::new(None),
        }
    }
}

#[derive(Serialize, Clone)]
struct MutePayload {
    muted: bool,
}

pub fn setup(app: &AppHandle<Wry>) -> tauri::Result<()> {
    app.manage(TrayState::default());

    let open_item = MenuItem::with_id(app, MENU_ID_OPEN, "Открыть Quorum", true, None::<&str>)?;
    let mute_item = CheckMenuItem::with_id(
        app,
        MENU_ID_MUTE,
        "Без уведомлений",
        true,
        false,
        None::<&str>,
    )?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit_item = MenuItem::with_id(app, MENU_ID_QUIT, "Выйти", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open_item, &mute_item, &separator, &quit_item])?;

    {
        let state: State<'_, TrayState> = app.state();
        *state.mute_item.lock().expect("tray mute_item mutex poisoned") = Some(mute_item);
    }

    let icon = Image::from_bytes(ICON_DEFAULT_BYTES)?;
    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(icon)
        .tooltip("Quorum")
        .menu(&menu)
        .on_menu_event(handle_menu_event)
        .on_tray_icon_event(handle_tray_icon_event)
        .build(app)?;

    Ok(())
}

fn handle_menu_event(app: &AppHandle<Wry>, event: MenuEvent) {
    match event.id.as_ref() {
        MENU_ID_OPEN => {
            show_main_window(app);
        }
        MENU_ID_MUTE => {
            let state: State<'_, TrayState> = app.state();
            let new_value = {
                let mut muted = state.muted.lock().expect("tray mute mutex poisoned");
                *muted = !*muted;
                *muted
            };
            // Зеркалим во фронт; фронт обновит свой zustand-store + persist в tauri-store.
            let _ = app.emit(EVENT_MUTE_TOGGLED, MutePayload { muted: new_value });
        }
        MENU_ID_QUIT => {
            app.exit(0);
        }
        _ => {}
    }
}

fn handle_tray_icon_event(tray: &tauri::tray::TrayIcon<Wry>, event: TrayIconEvent) {
    if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
    } = event
    {
        show_main_window(tray.app_handle());
    }
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

/// Применить unread-счётчик: меняем tooltip и (если фронт прислал ненулевое
/// значение) подменяем иконку на «с точкой».
pub fn apply_unread(app: &AppHandle<Wry>, count: u32) -> tauri::Result<()> {
    {
        let state: State<'_, TrayState> = app.state();
        *state.unread.lock().expect("tray unread mutex poisoned") = count;
    }

    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        return Ok(());
    };

    let tooltip = if count == 0 {
        "Quorum".to_string()
    } else {
        format!("Quorum • {count} непрочитанных")
    };
    tray.set_tooltip(Some(tooltip))?;

    let bytes = if count == 0 { ICON_DEFAULT_BYTES } else { ICON_UNREAD_BYTES };
    let icon = Image::from_bytes(bytes)?;
    tray.set_icon(Some(icon))?;
    Ok(())
}

#[tauri::command]
pub fn set_unread_count(app: AppHandle<Wry>, count: u32) -> Result<(), String> {
    apply_unread(&app, count).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn set_mute_state(state: State<'_, TrayState>, muted: bool) -> Result<(), String> {
    *state.muted.lock().expect("tray mute mutex poisoned") = muted;

    if let Some(item) = state
        .mute_item
        .lock()
        .expect("tray mute_item mutex poisoned")
        .as_ref()
    {
        let _ = item.set_checked(muted);
    }
    Ok(())
}

#[tauri::command]
pub fn get_mute_state(state: State<'_, TrayState>) -> bool {
    let muted = *state.muted.lock().expect("tray mute mutex poisoned");
    muted
}

/// Hook на main-window: закрытие → hide вместо exit.
pub fn on_main_window_event<R: Runtime>(event: &WindowEvent, window: &tauri::Window<R>) {
    if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
    }
}
