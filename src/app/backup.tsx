import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Card } from '@/components/card';
import { Field } from '@/components/field';
import { Screen } from '@/components/screen';
import { Text } from '@/components/text';
import {
  BACKUP_ERROR_HI, BackupError, backupFileName, createBackup, describeMerge, MIN_PASSWORD_LENGTH, restoreBackup, type MergeReport,
} from '@/backup';
import { getDb, type Db } from '@/db';
import { getUnlocked } from '@/ledgers/session';
import { back } from '@/nav';
import { syncSoon } from '@/sync/runtime';
import { colors, type } from '@/theme';
import { track } from '@/analytics';

const MAX_FILE = 50 * 1024 * 1024;
const dbOf = async () => (await getDb()) as unknown as Db;

/**
 * Backup file for families who never sign in. mode=create: pick a password and share a locked file (WhatsApp, Bluetooth,
 * Files). mode=restore: pick the file, enter its password, merge it into this phone. expo-file-system picks and writes the file
 * and expo-sharing shares it, both loaded only when used.
 */
export default function Backup() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  return mode === 'restore' ? <Restore /> : <Create />;
}

function Create() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const ok = pw.length >= MIN_PASSWORD_LENGTH && pw === pw2;

  const make = async () => {
    setBusy(true);
    setMsg('');
    try {
      const { getRandomBytes } = await import('expo-crypto');
      const r = await createBackup(await dbOf(), pw, getUnlocked(), { randomBytes: getRandomBytes });
      track('backup_created');
      const FS = await import('expo-file-system');
      const file = new FS.File(FS.Paths.cache, backupFileName());
      file.create({ overwrite: true });
      file.write(r.file);
      const Sharing = await import('expo-sharing');
      if (!(await Sharing.isAvailableAsync())) {
        setMsg('इस फ़ोन में फ़ाइल भेजने की सुविधा नहीं है।');
      } else {
        await Sharing.shareAsync(file.uri, { mimeType: 'application/octet-stream', dialogTitle: 'बैकअप फ़ाइल भेजें' });
        setMsg(
          `फ़ाइल बन गई (${r.entryCount} एंट्री)। पासवर्ड याद रखें, भूलने पर फ़ाइल कोई नहीं खोल सकता।` +
            (r.skippedLedgers.length ? `\nइन खातों का पिन नहीं डाला था, इसलिए ये फ़ाइल में नहीं हैं: ${r.skippedLedgers.join(', ')}। उस खाते को खोलकर फिर बैकअप बनाएँ।` : ''),
        );
      }
      try {
        file.delete();
      } catch {
        /* the cache folder is cleaned by the system anyway */
      }
    } catch {
      setMsg('फ़ाइल नहीं बन पाई। फिर कोशिश करें।');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      title="बैकअप फ़ाइल बनाएं"
      action={{ icon: 'share', label: busy ? 'बना रहे हैं… रुकिए' : 'फ़ाइल बनाएं', disabled: !ok || busy, onPress: make }}
    >
      <Text style={styles.body}>पूरा हिसाब एक फ़ाइल में ताले के साथ बनेगा। उसे WhatsApp या ब्लूटूथ से भेज सकते हैं। ताले का पासवर्ड आप चुनिए।</Text>
      <Field label={`पासवर्ड (कम से कम ${MIN_PASSWORD_LENGTH} अक्षर)`} value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" />
      <Field label="वही पासवर्ड फिर से" value={pw2} onChangeText={setPw2} secureTextEntry autoCapitalize="none" />
      {pw2 && pw !== pw2 ? <Text style={styles.err}>दोनों पासवर्ड अलग हैं</Text> : null}
      {msg ? <Card tint="haldi"><Text style={styles.body}>{msg}</Text></Card> : null}
    </Screen>
  );
}

function Restore() {
  const [text, setText] = useState<string | null>(null);
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [done, setDone] = useState<MergeReport | null>(null);

  const pick = async () => {
    setMsg('');
    try {
      const { File } = await import('expo-file-system');
      const r = await File.pickFileAsync({ mimeTypes: ['*/*'] });
      if (r.canceled) return;
      if ((r.result.size ?? 0) > MAX_FILE) return setMsg(BACKUP_ERROR_HI.not_a_backup);
      setText(await r.result.text());
    } catch {
      setMsg('फ़ाइल नहीं खुल पाई।');
    }
  };

  const restore = async () => {
    if (text === null) return;
    setBusy(true);
    setMsg('');
    try {
      const rep = await restoreBackup(await dbOf(), text, pw);
      track('backup_restored');
      setDone(rep);
      syncSoon();
    } catch (e) {
      setMsg(e instanceof BackupError ? BACKUP_ERROR_HI[e.code] : 'वापस नहीं ला पाए। फिर कोशिश करें।');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <Screen title="हिसाब वापस आ गया" action={{ icon: 'check', label: 'ठीक है', onPress: () => back() }}>
        <Card tint="success"><Text style={styles.body}>{describeMerge(done)}</Text></Card>
      </Screen>
    );
  }
  return (
    <Screen
      title="फ़ाइल से वापस लाएं"
      action={
        text === null
          ? { icon: 'doc', label: 'फ़ाइल चुनें', onPress: pick }
          : { icon: 'check', label: busy ? 'खोल रहे हैं… रुकिए' : 'वापस लाएं', disabled: !pw || busy, onPress: restore }
      }
    >
      {text === null ? (
        <Text style={styles.body}>बैकअप फ़ाइल चुनिए। जो हिसाब फ़ोन में पहले से है वह नहीं बदलेगा, सिर्फ़ नया जुड़ेगा।</Text>
      ) : (
        <>
          <Text style={styles.body}>फ़ाइल मिल गई। अब उसका पासवर्ड डालिए।</Text>
          <Field label="फ़ाइल का पासवर्ड" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" />
        </>
      )}
      {msg ? <Text style={styles.err}>{msg}</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { ...type.body, color: colors.ink },
  err: { ...type.bodyBold, color: colors.given },
});
