import Foundation
import EventKit
import AppKit

struct Patch: Decodable { let key: String; let id: String?; let title: String?; let done: Bool?; let due: String?; let listId: String?; let clearDue: Bool? }
struct Request: Decodable { let operation: String; let updates: [Patch]? }
struct Item: Codable { let id: String; let externalId: String?; let key: String?; let title: String; let done: Bool; let due: String; let listId: String; let modified: Double }
struct List: Codable { let id: String; let title: String; let writable: Bool }
struct Response: Encodable { let items: [Item]; let lists: [List]; let applied: [String:String] }
let store = EKEventStore()
func fail(_ message: String) -> Never { FileHandle.standardError.write(Data(message.utf8)); exit(1) }
func awaitResult<T>(_ start: (@escaping (T) -> Void) -> Void) -> T? {
    var result: T? = nil
    start { result = $0 }
    let deadline = Date().addingTimeInterval(90)
    while result == nil && Date() < deadline { RunLoop.current.run(until: Date().addingTimeInterval(0.04)) }
    return result
}
func dueText(_ r: EKReminder) -> String {
    guard let c = r.dueDateComponents, let y=c.year, let m=c.month, let d=c.day else { return "" }
    let day = String(format:"%04d-%02d-%02d", y,m,d)
    if let h=c.hour { return day + String(format:" %02d:%02d",h,c.minute ?? 0) }
    return day
}
func components(_ s: String) throws -> DateComponents {
    let a = s.split(whereSeparator: { $0 == "-" || $0 == " " || $0 == ":" }).compactMap { Int($0) }
    guard a.count == 3 || a.count == 5, (1...12).contains(a[1]), (1...31).contains(a[2]) else { throw NSError(domain:"Invalid date",code:1) }
    var c = DateComponents(); c.calendar=Calendar.current; c.timeZone=TimeZone.current; c.year=a[0]; c.month=a[1]; c.day=a[2]
    if a.count == 5 { guard (0...23).contains(a[3]), (0...59).contains(a[4]) else { throw NSError(domain:"Invalid time",code:1) }; c.hour=a[3]; c.minute=a[4] }
    return c
}
do {
    let raw = FileHandle.standardInput.readDataToEndOfFile()
    let request = try JSONDecoder().decode(Request.self, from:raw)
    guard ["snapshot","apply"].contains(request.operation) else { fail("未知操作") }
    var auth = EKEventStore.authorizationStatus(for:.reminder)
    if auth == .notDetermined {
        NSApplication.shared.setActivationPolicy(.accessory)
        NSApplication.shared.activate(ignoringOtherApps:true)
        let granted: Bool? = awaitResult { cb in store.requestFullAccessToReminders { ok, _ in cb(ok) } }
        guard granted == true else { fail("需要提醒事项访问权限：系统设置 → 隐私与安全性 → 提醒事项，允许「Obsidian 待办同步」或 Obsidian。") }
        auth = EKEventStore.authorizationStatus(for:.reminder)
    }
    guard auth == .fullAccess else { fail("提醒事项访问未获授权，请在系统设置 → 隐私与安全性 → 提醒事项中允许访问。") }
    let calendars = store.calendars(for:.reminder)
    guard let fetchedResult: (Bool, [EKReminder]) = awaitResult({ cb in store.fetchReminders(matching:store.predicateForReminders(in:calendars)) { cb(($0 != nil, $0 ?? [])) } }), fetchedResult.0 else { fail("读取提醒事项失败，本次未同步。") }
    let fetched = fetchedResult.1
    var applied: [String:String] = [:]
    if request.operation == "apply" {
        for patch in request.updates ?? [] {
            let reminder: EKReminder
            if let id=patch.id {
                guard let existing = fetched.first(where:{$0.calendarItemIdentifier==id}) else { fail("任务已在 Mac 删除，请重新同步。") }
                reminder = existing
            } else if let existing = fetched.first(where:{$0.url?.absoluteString == "obsidian-reminder://task/" + patch.key}) {
                reminder = existing
            } else {
                reminder = EKReminder(eventStore:store)
                guard let cal = calendars.first(where:{$0.calendarIdentifier==patch.listId && $0.allowsContentModifications}) ?? store.defaultCalendarForNewReminders() else { fail("Mac 没有可写的提醒事项列表，请先在提醒事项中新建列表。") }
                reminder.calendar=cal; reminder.url=URL(string:"obsidian-reminder://task/"+patch.key)
            }
            guard reminder.calendar.allowsContentModifications else { fail("提醒事项列表为只读，无法写入。") }
            if let listId=patch.listId, let cal=calendars.first(where:{$0.calendarIdentifier==listId && $0.allowsContentModifications}) { reminder.calendar=cal }
            if let title=patch.title { reminder.title=title }
            if let done=patch.done { reminder.isCompleted=done }
            if patch.clearDue == true { reminder.dueDateComponents=nil }
            else if let due=patch.due { reminder.dueDateComponents=try components(due) }
            try store.save(reminder,commit:true)
            applied[patch.key]=reminder.calendarItemIdentifier
        }
    }
    store.reset()
    let finalCalendars=store.calendars(for:.reminder)
    guard let finalResult: (Bool, [EKReminder]) = awaitResult({ cb in store.fetchReminders(matching:store.predicateForReminders(in:finalCalendars)) { cb(($0 != nil, $0 ?? [])) } }), finalResult.0 else { fail("读取同步结果失败；下次将通过任务标识恢复。") }
    let final = finalResult.1
    let items=final.map { r in Item(id:r.calendarItemIdentifier,externalId:r.calendarItemExternalIdentifier,key:r.url?.scheme == "obsidian-reminder" ? r.url?.lastPathComponent : nil,title:r.title ?? "",done:r.isCompleted,due:dueText(r),listId:r.calendar.calendarIdentifier,modified:r.lastModifiedDate?.timeIntervalSince1970 ?? 0) }
    let lists=finalCalendars.map { List(id:$0.calendarIdentifier,title:$0.title,writable:$0.allowsContentModifications) }
    let response=Response(items:items,lists:lists,applied:applied)
    FileHandle.standardOutput.write(try JSONEncoder().encode(response))
} catch { fail("同步失败："+error.localizedDescription) }
