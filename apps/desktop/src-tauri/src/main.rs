// Скрываем консоль на Windows в release-сборке
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    quorum_desktop_lib::run()
}
