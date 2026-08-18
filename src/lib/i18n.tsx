import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type AppLocale = "zh-CN" | "en";
export const LANGUAGE_STORAGE_KEY = "archive-viewer.locale";

const messages = {
  "zh-CN": {
    import: "导入对话", importFile: "选择文件", importFolder: "选择文件夹", importing: "正在导入…", importTitle: "导入你的对话记录", importHint: "选择文件或文件夹，或拖入 ZIP、JSON、HTML、Markdown 和文件夹；文件仅在本地处理。", globalDrop: "松开以导入对话文件", home: "主页", openList: "打开对话列表", closeList: "关闭列表", search: "搜索", searchPlaceholder: "搜索对话", conversationCount: "{visible} / {total} 个对话", noMatches: "没有匹配的对话。", noReadableMessages: "此对话没有可阅读的消息。", loading: "正在读取本地对话…", resume: "继续浏览已有分组", backHome: "返回导入主页",
    export: "导出", copyBranch: "复制当前分支", copyBranchHint: "只复制当前通过箭头选中的对话路径。", copied: "已复制", copyFailed: "复制失败", copyConversation: "复制对话", include: "包含内容", title: "标题", roles: "角色", timestamps: "时间", models: "模型", missingPlaceholders: "缺失消息占位", continuation: "继续对话提示词", restoreDefault: "恢复默认",
    groups: "分组", newGroup: "新增分组", renameGroup: "重命名分组", editGroup: "编辑分组", groupRemark: "备注", groupRemarkPlaceholder: "例如：work@example.com", groupNameRequired: "请填写分组名称。", deleteGroup: "删除当前分组", deleteGroupAgain: "再次点击垃圾桶即可删除当前分组", clearAll: "清除所有本地数据", clearAllAgain: "再次点击垃圾桶即可清除所有本地数据", appearance: "外观", system: "跟随系统", light: "浅色", dark: "深色", language: "语言", chinese: "中文", english: "English", chooseGroup: "选择分组", collapseSidebar: "收起侧边栏", expandSidebar: "展开侧边栏", openSearch: "打开搜索",
    createGroup: "新增分组", renameGroupTitle: "重命名分组", deleteGroupTitle: "删除当前分组？", clearAllTitle: "清除所有本地数据？", deleteGroupDescription: "当前分组内的所有对话与附件都会从本设备移除，此操作无法恢复。", clearAllDescription: "所有分组、对话、附件与本地设置都会从本设备移除，此操作无法恢复。", createGroupDescription: "创建后可以在此分组中导入更多对话。", renameGroupDescription: "为当前分组设置一个容易辨认的名称。", groupName: "分组名称", groupNamePlaceholder: "例如：工作账号", cancel: "取消", confirm: "确认", delete: "删除分组", clear: "清除全部",
    importDestination: "选择导入分组", importDestinationHint: "请选择新建分组，或合并到已有分组。", createNewGroup: "新建分组", mergeInto: "合并", recommended: "推荐", importNow: "开始导入", unknownDate: "未知日期", importSkippedEmpty: "已跳过 {count} 个没有可阅读内容的空对话。", importSummary: "导入完成：新增 {conversations} 个对话、{messages} 条消息；跳过 {skipped} 条重复消息{revisions}。", revisions: "；保留 {count} 个修订分支", invalidLink: "链接中的分组或对话在本设备上不存在，已返回首页。", conversationList: "对话列表", messageBranch: "消息分支", previousVersion: "上一版本", nextVersion: "下一版本", inferredMissing: "根据导出的 UUID 关系推断了角色和上游位置；内容不可用。", messages: "消息", detachedFragments: "断开的对话片段", detachedHint: "导出文件引用了不存在的父消息。这些片段保留原有的同级关系，不会被猜测性地放入主时间线。", fragment: "片段 {count}", missingParent: "导出中缺少父消息", missingParentHint: "此消息被 {count} 个已导出的消息版本引用，但其角色与内容没有出现在导出文件中。", importedAttachment: "导入的附件", role_system: "系统", role_user: "用户", role_assistant: "助手", role_tool: "工具", role_unknown: "未知",
  },
  en: {
    import: "Import conversations", importFile: "Choose files", importFolder: "Choose folder", importing: "Importing…", importTitle: "Import your conversations", importHint: "Choose files or a folder, or drop ZIP, JSON, HTML, Markdown, and folders. Files stay on this device.", globalDrop: "Drop to import conversations", home: "Home", openList: "Open conversation list", closeList: "Close list", search: "Search", searchPlaceholder: "Search conversations", conversationCount: "{visible} / {total} conversations", noMatches: "No conversations match this search.", noReadableMessages: "No readable messages were found in this conversation.", loading: "Loading local conversations…", resume: "Continue browsing groups", backHome: "Back to import home",
    export: "Export", copyBranch: "Copy current branch", copyBranchHint: "Only the conversation path selected with the arrows is copied.", copied: "Copied", copyFailed: "Copy failed", copyConversation: "Copy conversation", include: "Include", title: "Title", roles: "Roles", timestamps: "Timestamps", models: "Models", missingPlaceholders: "Missing-message placeholders", continuation: "Continuation prompt", restoreDefault: "Restore default",
    groups: "Groups", newGroup: "New group", renameGroup: "Rename group", editGroup: "Edit group", groupRemark: "Note", groupRemarkPlaceholder: "For example, work@example.com", groupNameRequired: "Enter a group name.", deleteGroup: "Delete current group", deleteGroupAgain: "Click the trash icon again to delete this group", clearAll: "Clear all local data", clearAllAgain: "Click the trash icon again to clear all local data", appearance: "Appearance", system: "System", light: "Light", dark: "Dark", language: "Language", chinese: "中文", english: "English", chooseGroup: "Choose group", collapseSidebar: "Collapse sidebar", expandSidebar: "Expand sidebar", openSearch: "Open search",
    createGroup: "Create group", renameGroupTitle: "Rename group", deleteGroupTitle: "Delete current group?", clearAllTitle: "Clear all local data?", deleteGroupDescription: "All conversations and attachments in this group will be removed from this device. This cannot be undone.", clearAllDescription: "Every group, conversation, attachment, and local setting will be removed from this device. This cannot be undone.", createGroupDescription: "You can import more conversations into this group after creating it.", renameGroupDescription: "Give the current group an easy-to-recognise name.", groupName: "Group name", groupNamePlaceholder: "For example, Work account", cancel: "Cancel", confirm: "Confirm", delete: "Delete group", clear: "Clear all",
    importDestination: "Choose an import destination", importDestinationHint: "Create a new group or merge into an existing group.", createNewGroup: "New group", mergeInto: "Merge", recommended: "Recommended", importNow: "Import", unknownDate: "Unknown date", importSkippedEmpty: "Skipped {count} empty conversations with no readable content.", importSummary: "Import complete: {conversations} conversations and {messages} messages added; {skipped} duplicate messages skipped{revisions}.", revisions: "; {count} revisions preserved as branches", invalidLink: "The group or conversation in this link is not available on this device. Returned to the home page.", conversationList: "Conversations", messageBranch: "Message branch", previousVersion: "Previous version", nextVersion: "Next version", inferredMissing: "Role and upstream position inferred from exported UUID relationships; content unavailable.", messages: "messages", detachedFragments: "Detached conversation fragments", detachedHint: "The export references parent messages that are not present. These fragments retain their original sibling relationships without being assigned a guessed position.", fragment: "Fragment {count}", missingParent: "Parent message missing from export", missingParentHint: "This message is referenced by {count} exported message versions, but its role and content are not present in the ZIP.", importedAttachment: "Imported attachment", role_system: "system", role_user: "user", role_assistant: "assistant", role_tool: "tool", role_unknown: "unknown",
  },
} as const;

type TranslationKey = keyof typeof messages["zh-CN"];
type Interpolations = Record<string, string | number>;
interface I18nValue { locale: AppLocale; setLocale(locale: AppLocale): void; t(key: TranslationKey, values?: Interpolations): string; }
const I18nContext = createContext<I18nValue | undefined>(undefined);

export function readLocale(): AppLocale {
  const saved = localStorage.getItem(LANGUAGE_STORAGE_KEY);
  if (saved === "zh-CN" || saved === "en") return saved;
  return navigator.language.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, updateLocale] = useState<AppLocale>(readLocale);
  const value = useMemo<I18nValue>(() => ({ locale, setLocale(next) { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); updateLocale(next); }, t(key, values) {
    return (messages[locale][key] as string).replace(/\{(\w+)\}/g, (_, name: string) => String(values?.[name] ?? `{${name}}`));
  } }), [locale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error("useI18n must be used inside I18nProvider");
  return value;
}
