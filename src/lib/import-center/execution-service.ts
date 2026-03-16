import type { ContactImportRunInput } from "@/lib/import-center/types";
import { runContactsImport } from "@/lib/import-center/contact-import-service";

export async function executeImportCenterJob(input: ContactImportRunInput) {
  if (input.importType === "contacts") {
    return runContactsImport(input);
  }
  throw new Error(`Unsupported import type: ${String(input.importType)}`);
}
