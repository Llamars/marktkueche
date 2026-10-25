import { useRef, useState } from 'react';
import { ClipboardPaste, Download, HardDrive, Link2, Upload } from 'lucide-react';
import { decodeShare, extractShareCode } from '../lib/share';
import { useStore, type Backup } from '../store';
import { Button, Card, inputCls, SectionTitle } from './ui';

/** Geteilte Links übernehmen und die Daten dieses Geräts sichern bzw. wiederherstellen. */
export function DataSection() {
  const setIncoming = useStore((s) => s.setIncoming);
  const exportBackup = useStore((s) => s.exportBackup);
  const restoreBackup = useStore((s) => s.restoreBackup);
  const toast = useStore((s) => s.toast);
  const [link, setLink] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function take(text: string) {
    const code = extractShareCode(text);
    const pkg = code ? await decodeShare(code) : null;
    if (!pkg) return toast('Das ist kein gültiger Marktküche-Link.');
    setLink('');
    setIncoming(pkg);
  }

  async function paste() {
    try {
      await take(await navigator.clipboard.readText());
    } catch {
      toast('Kein Zugriff auf die Zwischenablage – bitte den Link ins Feld einfügen.');
    }
  }

  function download() {
    const blob = new Blob([JSON.stringify(exportBackup(), null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `marktkueche-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  async function restore(file: File) {
    try {
      const b = JSON.parse(await file.text()) as Backup;
      if (b?.app !== 'marktkueche' || !b.state) throw new Error();
      const when = new Date(b.exportedAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' });
      if (!confirm(`Sicherung vom ${when} laden? Plan, Einkaufsliste, Einstellungen und Angebote auf diesem Gerät werden dadurch ersetzt.`)) return;
      restoreBackup(b);
      toast('Sicherung geladen.');
    } catch {
      toast('Diese Datei ist keine Marktküche-Sicherung.');
    }
  }

  return (
    <>
      <SectionTitle>Geteilten Link übernehmen</SectionTitle>
      <Card>
        <p className="mb-3 text-sm text-muted">
          Hat dir jemand ein Rezept oder eine Einkaufsliste geschickt? Link öffnen – oder hier einfügen, falls er sich im Browser
          statt in deiner Marktküche geöffnet hat.
        </p>
        <form onSubmit={(e) => { e.preventDefault(); take(link); }} className="flex gap-2">
          <div className="relative flex-1">
            <Link2 size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input className={`${inputCls} pl-9`} value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link einfügen" />
          </div>
          <Button type="submit" disabled={!link.trim()} className="px-4">Ansehen</Button>
        </form>
        <button onClick={paste} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand">
          <ClipboardPaste size={16} /> Aus der Zwischenablage einfügen
        </button>
      </Card>

      <SectionTitle>Daten & Sicherung</SectionTitle>
      <Card>
        <p className="flex items-start gap-2 text-sm text-muted">
          <HardDrive size={16} className="mt-0.5 shrink-0 text-brand" />
          <span>
            Alles liegt nur auf diesem Gerät, es gibt kein Konto und keinen Server. Tipp fürs iPhone: Marktküche über „Teilen →
            Zum Home-Bildschirm“ als App ablegen – sonst kann Safari die Daten nach längerer Nichtnutzung löschen.
          </span>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2.5">
          <Button variant="secondary" onClick={download}><Download size={17} /> Sicherung speichern</Button>
          <Button variant="secondary" onClick={() => fileRef.current?.click()}><Upload size={17} /> Sicherung laden</Button>
        </div>
        <p className="mt-2 text-xs text-muted">Auch zum Umziehen auf ein neues Handy: Datei speichern, auf dem neuen Gerät laden.</p>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) restore(f); e.target.value = ''; }} />
      </Card>
    </>
  );
}
