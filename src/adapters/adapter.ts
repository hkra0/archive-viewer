import type { ImportWarning, UniversalConversation } from "../domain/conversation";

export interface ImportCandidate {
  name: string;
  text: string;
  mimeType?: string;
  attachments?: Map<string, File>;
}

export interface DetectionResult {
  supported: boolean;
  confidence: number;
  reason: string;
}

export interface AdapterParseResult {
  conversations: UniversalConversation[];
  warnings: ImportWarning[];
}

/** Each provider is isolated behind this interface to keep the UI platform-neutral. */
export interface FormatAdapter {
  id: string;
  displayName: string;
  detect(input: ImportCandidate): DetectionResult;
  parse(input: ImportCandidate): AdapterParseResult;
}
