mod db;
mod meetings;
mod tasks;

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{Manager, State};

use crate::meetings::{Meeting, MeetingSummary};
use crate::tasks::Task;

/// The name of the database file in the application data directory.
const DATABASE_FILE: &str = "gps.sqlite";

/// The open database connection, shared by all commands.
struct Database(Mutex<Connection>);

impl Database {
    /// Locks the connection, runs `operation` with it, and converts errors to messages for
    /// the frontend.
    fn run<T, E: std::fmt::Display>(
        &self,
        operation: impl FnOnce(&Connection) -> Result<T, E>,
    ) -> Result<T, String> {
        let connection = self
            .0
            .lock()
            .map_err(|_| "the database is not available".to_owned())?;
        operation(&connection).map_err(|error| error.to_string())
    }
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn list_meetings(database: State<'_, Database>) -> Result<Vec<MeetingSummary>, String> {
    database.run(meetings::list)
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn create_meeting(database: State<'_, Database>, date: &str) -> Result<Meeting, String> {
    database.run(|connection| meetings::create(connection, date))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn get_meeting(database: State<'_, Database>, id: i64) -> Result<Option<Meeting>, String> {
    database.run(|connection| meetings::get(connection, id))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn update_meeting(
    database: State<'_, Database>,
    id: i64,
    name: &str,
    date: &str,
    notes: &str,
) -> Result<Meeting, String> {
    database.run(|connection| meetings::update(connection, id, name, date, notes))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn archive_meeting(database: State<'_, Database>, id: i64) -> Result<(), String> {
    database.run(|connection| meetings::archive(connection, id))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn unarchive_meeting(database: State<'_, Database>, id: i64) -> Result<(), String> {
    database.run(|connection| meetings::unarchive(connection, id))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn list_meeting_tasks(database: State<'_, Database>, meeting_id: i64) -> Result<Vec<Task>, String> {
    database.run(|connection| tasks::list_for_meeting(connection, meeting_id))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn create_task(
    database: State<'_, Database>,
    meeting_id: i64,
    description: &str,
) -> Result<Task, String> {
    database.run(|connection| tasks::create(connection, meeting_id, description))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn update_task_description(
    database: State<'_, Database>,
    id: i64,
    description: &str,
) -> Result<Task, String> {
    database.run(|connection| tasks::update_description(connection, id, description))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn set_task_completed(
    database: State<'_, Database>,
    id: i64,
    completed: bool,
) -> Result<Task, String> {
    database.run(|connection| tasks::set_completed(connection, id, completed))
}

#[tauri::command]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri gives managed state to commands by value"
)]
fn delete_task(database: State<'_, Database>, id: i64) -> Result<(), String> {
    database.run(|connection| tasks::delete(connection, id))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&directory)?;
            let connection = db::open(&directory.join(DATABASE_FILE))?;
            app.manage(Database(Mutex::new(connection)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            list_meetings,
            create_meeting,
            get_meeting,
            update_meeting,
            archive_meeting,
            unarchive_meeting,
            list_meeting_tasks,
            create_task,
            update_task_description,
            set_task_completed,
            delete_task
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
