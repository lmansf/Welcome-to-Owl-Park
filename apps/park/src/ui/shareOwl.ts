/**
 * The quiz reveal's Share my owl button (OP-392), behind the park's `share` flag: it hands out the
 * address of that owl's own page (`/owl/<nature>`, drawn by the room server) with one line of words.
 * The phone's share sheet sends it where there is one; otherwise the link goes on the clipboard and
 * the button says so. Nothing personal goes with it: only which of the five owls it is.
 */
import { OWL_SHARE_WORDS, owlSharePath, type NatureDef } from '@owl-park/shared';

/** What the device offers: the share sheet, the clipboard, or neither. */
export interface ShareDevice {
  share?: ((data: { title?: string; text?: string; url?: string }) => Promise<void>) | undefined;
  clipboard?: { writeText(text: string): Promise<void> } | undefined;
}

/** How a press ended: sent from the share sheet, copied, closed without sending, or nothing worked. */
export type ShareEnd = 'shared' | 'copied' | 'cancelled' | 'failed';

/** The address to share for an owl, on the park's own origin. */
export function owlShareUrl(def: NatureDef, origin: string): string {
  return `${origin.replace(/\/$/, '')}${owlSharePath(def.id)}`;
}

/** Share an owl's page: the share sheet first, then the clipboard. */
export async function shareOwl(def: NatureDef, origin: string, device: ShareDevice): Promise<ShareEnd> {
  const url = owlShareUrl(def, origin);
  if (device.share) {
    try {
      await device.share({ title: OWL_SHARE_WORDS.pageTitle(def), text: OWL_SHARE_WORDS.text(def), url });
      return 'shared';
    } catch (e) {
      // Closing the sheet is a choice, not a fault; anything else falls back to the clipboard.
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  if (device.clipboard) {
    try {
      await device.clipboard.writeText(`${OWL_SHARE_WORDS.text(def)} ${url}`);
      return 'copied';
    } catch {
      return 'failed';
    }
  }
  return 'failed';
}
