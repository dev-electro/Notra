/**
 * Privacy policy, terms, grievance officer and account-deletion text: ONE source shared by the app (legal screens) and the
 * server (GET /privacy, /terms, /grievance, /delete-account, which the Play Store listing links to). Plain TypeScript, no
 * React or Expo imports, so the Worker can bundle it. Hindi first, English below.
 *
 * Everything in CONTACT is a PLACEHOLDER: replace it before release (see docs/PLAY_STORE.md). The text describes what the
 * app really does today; if behaviour changes (a new SDK, a new permission, loans), change this file in the same commit.
 */
export const LEGAL_UPDATED = '2026-10-05';

export const CONTACT = {
  /** Who runs the service. REPLACE before release. */
  operator: '[संचालक का नाम / Operator name]',
  /** Grievance officer. REPLACE before release. */
  officerName: '[शिकायत अधिकारी का नाम / Grievance Officer name]',
  email: 'grievance@notra-diary.example',
  phone: '+91-00000-00000',
  address: '[पता / Address]',
  /** Days within which a grievance gets an answer (DPDP). */
  responseDays: 30,
} as const;

export type LegalId = 'privacy' | 'terms' | 'grievance' | 'delete-account';

interface Lang {
  h: string;
  p: string[];
}
export interface LegalSection {
  hi: Lang;
  en: Lang;
}
export interface LegalDoc {
  id: LegalId;
  titleHi: string;
  titleEn: string;
  /** 3-4 plain bullets shown first in the app; the full text sits behind "पूरा पढ़ें". */
  summary: { hi: string[]; en: string[] };
  sections: LegalSection[];
}

const privacy: LegalDoc = {
  id: 'privacy',
  titleHi: 'गोपनीयता नीति',
  titleEn: 'Privacy Policy',
  summary: {
    hi: [
      'आपका हिसाब आपके फ़ोन में रहता है, ताले में (एनक्रिप्टेड)।',
      'बैकअप चालू करें तभी हिसाब की कॉपी इंटरनेट पर जाती है।',
      'मुफ़्त ऐप में हिसाब के पन्नों के बाहर Google AdMob के विज्ञापन दिखते हैं। आपका हिसाब विज्ञापन वालों को कभी नहीं जाता।',
      'हम आपका डेटा बेचते नहीं। हम संपर्क, SMS, कॉल या लोकेशन नहीं देखते।',
    ],
    en: [
      'Your record stays on your phone, locked (encrypted).',
      'A copy goes online only if you turn on backup.',
      'The free app shows Google AdMob ads outside the diary screens. Your record is never shared with advertisers.',
      'We do not sell your data. We do not see contacts, SMS, calls or location.',
    ],
  },
  sections: [
    {
      hi: { h: 'यह ऐप क्या है', p: ['नोतरा डायरी आपके परिवार के नोतरा (आया और गया) का हिसाब रखने की डायरी है। यह आपका अपना हिसाब है। यह ऐप मुफ़्त है और कुछ पन्नों पर विज्ञापन दिखते हैं (नीचे "विज्ञापन" देखें)।'] },
      en: { h: 'What this app is', p: ["Notra Diary is a diary for keeping the record of your family's Notra gifts (received and given). It is your own record. The app is free and shows ads on some screens (see \"Advertising\" below)."] },
    },
    {
      hi: {
        h: 'हम कौन सी जानकारी रखते हैं',
        p: [
          'जो आप ऐप में लिखते हैं: परिवारों के नाम, पिता का नाम, जाति, अटक, गाँव, फला, (चाहें तो) फ़ोन नंबर और फ़ोटो; कार्यक्रम; रकम, सामान और तारीख़ की एंट्री; अपने परिवार की जानकारी और परिवार के सदस्यों के निजी खातों के नाम।',
          'अगर आप साइन इन करते हैं: Google खाते का नाम और पहचान संख्या, या आपका मोबाइल नंबर; साथ में ऐप का संस्करण, फ़ोन का प्रकार (Android) व उसका संस्करण, और बैकअप कब हुआ जैसी गतिविधि।',
          'अगर आप "शिकायत / सुझाव" भेजते हैं: आपकी लिखी बात और विषय।',
        ],
      },
      en: {
        h: 'What information we keep',
        p: [
          "What you write in the app: names of families, father's name, jati, atak, village, fala, (optionally) phone number and photo; events; entries of amounts, goods and dates; your own family's details and the names of family members' personal ledgers.",
          'If you sign in: your Google account name and ID, or your mobile number; also the app version, the phone type (Android) and its version, and activity such as when a backup happened.',
          'If you send a "Complaint / Suggestion": what you write and the subject.',
        ],
      },
    },
    {
      hi: {
        h: 'आपके फ़ोन पर',
        p: [
          'आपका सारा डेटा सबसे पहले आपके फ़ोन में रहता है, एनक्रिप्टेड डेटाबेस में। उसकी चाबी फ़ोन की सुरक्षित तिजोरी (keystore) में रहती है। ऐप बिना इंटरनेट के पूरा चलता है।',
          'जब तक आप साइन इन करके क्लाउड बैकअप चालू नहीं करते, आपका डेटा फ़ोन से बाहर नहीं जाता।',
          'पिन (ऐप लॉक या निजी खाते का) सिर्फ़ फ़ोन में, नमक (salt) लगाकर बने हैश के रूप में रहता है। पिन कभी सर्वर पर नहीं जाता और बैकअप फ़ाइल में नहीं जाता।',
        ],
      },
      en: {
        h: 'On your phone',
        p: [
          "All your data lives first on your phone, in an encrypted database. Its key is kept in the phone's secure keystore. The app works fully without internet.",
          'Until you sign in and turn on cloud backup, your data does not leave the phone.',
          'PINs (app lock or a personal ledger) stay only on the phone, as a salted hash. A PIN never goes to the server and is not put in a backup file.',
        ],
      },
    },
    {
      hi: {
        h: 'क्लाउड बैकअप (आपकी मर्ज़ी से)',
        p: [
          'साइन इन करने पर आपका हिसाब (परिवार, कार्यक्रम, एंट्री, खातों के नाम, आपके परिवार की जानकारी, लौटाने का नियम) इंटरनेट से हमारे सर्वर पर कॉपी होता है, ताकि फ़ोन खोने या बदलने पर वापस मिल सके। फ़ोटो और आवाज़ कॉपी नहीं होतीं। कॉपी HTTPS से जाती है।',
          'यह कॉपी एंड-टू-एंड एनक्रिप्टेड नहीं है, यानी हमारा सर्वर इसे पढ़ सकता है। हम इसे आपके खाते के अलावा किसी को नहीं दिखाते।',
          'बैकअप आप कभी भी सेटिंग में बंद कर सकते हैं।',
        ],
      },
      en: {
        h: 'Cloud backup (your choice)',
        p: [
          'When you sign in, your record (families, events, entries, ledger names, your family details, the return rule) is copied over the internet to our server so you can get it back if you lose or change your phone. Photos and voice are not copied. The copy travels over HTTPS.',
          'This copy is not end-to-end encrypted, which means our server can read it. We do not show it to anyone except your own account.',
          'You can turn backup off any time in Settings.',
        ],
      },
    },
    {
      hi: {
        h: 'फ़ोन की अनुमतियाँ',
        p: [
          'माइक्रोफ़ोन: सिर्फ़ तब जब आप "बोलकर लिखें" दबाते हैं। कैमरा या गैलरी: सिर्फ़ तब जब आप परिवार की फ़ोटो जोड़ते हैं।',
          'हम आपके संपर्क (contacts), SMS, कॉल लॉग या लोकेशन तक नहीं पहुँचते। मोबाइल OTP का कोड ऐप SMS से नहीं पढ़ता; आप उसे खुद डालते हैं।',
        ],
      },
      en: {
        h: 'Phone permissions',
        p: [
          'Microphone: only when you tap "speak to write". Camera or gallery: only when you add a family photo.',
          'We do not access your contacts, SMS, call log or location. The app does not read the OTP from SMS; you type it in yourself.',
        ],
      },
    },
    {
      hi: {
        h: 'बाहरी सेवाएँ',
        p: [
          'Google: साइन इन के लिए। बोलकर लिखने में फ़ोन की स्पीच पहचान सेवा चलती है; अगर फ़ोन में हिंदी की ऑफ़लाइन भाषा नहीं है तो आवाज़ फ़ोन की ऑनलाइन (Google की) सेवा को जा सकती है। ऐप आवाज़ सेव नहीं करती।',
          'SMS कंपनी: मोबाइल OTP भेजने के लिए आपका मोबाइल नंबर उन्हें जाता है, और किसी काम के लिए नहीं।',
          'सर्वर और डेटाबेस की होस्टिंग कंपनियाँ: क्लाउड बैकअप का डेटा उनके सर्वर पर रखा जाता है।',
          'Google AdMob: विज्ञापन दिखाने के लिए (नीचे "विज्ञापन" देखें)।',
          'ऐप में कोई क्रैश-रिपोर्टिंग सेवा नहीं है। इस्तेमाल के आँकड़े हम अपने ही सर्वर पर, सिर्फ़ ऊपर बताई जानकारी से बनाते हैं (नीचे "स्टाफ़ और आँकड़े" देखें)।',
        ],
      },
      en: {
        h: 'Outside services',
        p: [
          'Google: for sign-in. "Speak to write" uses the phone\'s speech recognition; if the phone has no offline Hindi model, the audio may go to the phone\'s online (Google) service. The app does not save the audio.',
          'SMS company: your mobile number is sent to them to deliver the OTP, for nothing else.',
          'Server and database hosting companies: cloud backup data is stored on their servers.',
          'Google AdMob: to show ads (see "Advertising" below).',
          'The app has no crash-reporting service. Usage statistics are made on our own server, only from the information listed above (see "Staff and statistics" below).',
        ],
      },
    },
    {
      hi: {
        h: 'विज्ञापन',
        p: [
          'ऐप मुफ़्त रखने के लिए इसमें Google AdMob के विज्ञापन दिखते हैं: घर और हिसाब के पन्ने पर, कुछ लंबी सूचियों के बीच, और रिपोर्ट भेजने के बाद कभी-कभी। एंट्री भरने, पिन, साइन इन, सेटिंग, बैकअप और खाता हटाने के पन्नों पर कोई विज्ञापन नहीं आता। विज्ञापन पर साफ़ "विज्ञापन" लिखा होता है। रिपोर्ट की फ़ोटो से "Notra Diary" की छोटी लाइन हटाने के लिए आप चाहें तो एक विज्ञापन देख सकते हैं; यह आपकी मर्ज़ी है।',
          'विज्ञापन दिखाने के लिए Google आपके फ़ोन की विज्ञापन पहचान (Advertising ID) और फ़ोन की सामान्य जानकारी इस्तेमाल कर सकता है। आपका हिसाब, परिवारों के नाम, रकम या कोई भी एंट्री विज्ञापन वालों को कभी नहीं भेजी जाती, और विज्ञापन के अनुरोध में आपके डेटा से कोई शब्द नहीं जाता।',
          'जहाँ क़ानून ज़रूरी बताता है (जैसे यूरोप में), Google की सहमति का फ़ॉर्म दिखता है, और सेटिंग में "विज्ञापन गोपनीयता विकल्प" से आप सहमति बदल सकते हैं। सहमति तय होने तक सिर्फ़ गैर-वैयक्तिक विज्ञापन माँगे जाते हैं। आप फ़ोन की सेटिंग में विज्ञापन पहचान मिटा या बदल सकते हैं।',
          'विज्ञापन सामग्री PG या उससे कम रेटिंग की रखी जाती है, और यह ऐप बच्चों के लिए नहीं है। Google की नीति: https://policies.google.com/technologies/ads',
        ],
      },
      en: {
        h: 'Advertising',
        p: [
          'To keep the app free it shows Google AdMob ads: on the Home and Hisaab screens, between items of some long lists, and sometimes after you send a report. No ads appear on the screens where you enter entries, or on PIN, sign-in, settings, backup and account-deletion screens. Every ad is clearly labelled "विज्ञापन" (Ad). If you wish, you can watch one ad to remove the small "Notra Diary" footer from a report photo; that is your choice.',
          'To show ads, Google may use your phone\'s advertising ID and general device information. Your record, family names, amounts or any entry are never sent to advertisers, and no word from your data goes into an ad request.',
          'Where the law requires it (for example in Europe), Google\'s consent form is shown, and you can change your choice in Settings under "Ad privacy options". Until consent is settled only non-personalised ads are requested. You can reset or delete the advertising ID in your phone\'s settings.',
          'Ad content is kept at PG rating or lower, and this app is not for children. Google\'s policy: https://policies.google.com/technologies/ads',
        ],
      },
    },
    {
      hi: {
        h: 'स्टाफ़ और आँकड़े',
        p: [
          'हमारे अधिकृत स्टाफ़ खाते की जानकारी देख सकते हैं: साइन इन का तरीका (Google या मोबाइल), ऐप का संस्करण और गतिविधि (जैसे बैकअप कब हुआ)। इसके अलावा वे बहुत सारे उपयोगकर्ताओं के मिले-जुले आँकड़े ही देखते हैं; जिस समूह में 5 से कम उपयोगकर्ता हों वह छिपा दिया जाता है।',
          'स्टाफ़ आपकी डायरी (परिवार, कार्यक्रम, एंट्री) नहीं पढ़ सकते। सहायता टीम आपकी डायरी सिर्फ़ तब, सिर्फ़ देखने के लिए, देख सकती है जब आप खुद सेटिंग में "सहायता को मेरा डेटा दिखाएं" चालू करें। यह सीमित दिनों (1, 3 या 7) के लिए होता है, आप इसे कभी भी बंद कर सकते हैं, और हर बार देखे जाने का रिकॉर्ड रखा जाता है।',
        ],
      },
      en: {
        h: 'Staff and statistics',
        p: [
          'Our authorised staff can see account information: the sign-in method (Google or mobile), the app version and activity (such as when a backup happened). Beyond that they see only combined statistics across many users; any group of fewer than 5 users is hidden.',
          'Staff cannot read your diary (families, events, entries). The support team can view your diary, read-only, only when you yourself turn on "Show my data to support" in Settings. This is for a limited time (1, 3 or 7 days), you can turn it off at any moment, and every such access is logged.',
        ],
      },
    },
    {
      hi: {
        h: 'हम क्या नहीं करते',
        p: [
          'हम आपका डेटा बेचते नहीं। आपका हिसाब विज्ञापन के लिए इस्तेमाल नहीं करते और विज्ञापन वालों से साझा नहीं करते। ऊपर बताई गई सेवाओं के अलावा किसी से साझा नहीं करते।',
          'ऐप में अभी कोई कर्ज़ (लोन) या ब्याज का काम नहीं है; यह सिर्फ़ हिसाब की डायरी है। भविष्य में ऐसा कुछ जोड़ा गया तो पहले आपकी अलग सहमति ली जाएगी और यह नीति बदली जाएगी।',
        ],
      },
      en: {
        h: 'What we do not do',
        p: [
          'We do not sell your data. We do not use your record for advertising or share it with advertisers. We do not share it with anyone other than the services listed above.',
          'The app has no loans or interest today; it is only a record diary. If anything like that is added in future, we will ask for your separate consent first and change this policy.',
        ],
      },
    },
    {
      hi: {
        h: 'कितने समय तक रखते हैं',
        p: ['फ़ोन पर: जब तक आप खुद न मिटाएँ। क्लाउड पर: जब तक आप अपना खाता न हटाएँ। खाता हटाने पर आपका क्लाउड डेटा हमारे डेटाबेस से उसी समय हट जाता है।'],
      },
      en: {
        h: 'How long we keep it',
        p: ['On the phone: until you erase it yourself. In the cloud: until you delete your account. When you delete your account, your cloud data is removed from our database right away.'],
      },
    },
    {
      hi: {
        h: 'आपके अधिकार',
        p: [
          'देखना और सुधारना: आपका सारा डेटा ऐप में दिखता है, और सुधार नई एंट्री से होता है। "बैकअप फ़ाइल" से आप अपना पूरा डेटा अपने पास रख सकते हैं।',
          'हटाना: सेटिंग में "खाता हटाएं" से, या हमें लिखकर। सहमति वापस लेना: बैकअप बंद करें या खाता हटाएं।',
          `शिकायत: "शिकायत अधिकारी" पेज देखें। हम ${CONTACT.responseDays} दिन के अंदर जवाब देंगे। जवाब से संतुष्टि न हो तो आप भारत के डेटा संरक्षण बोर्ड (Data Protection Board of India) के पास जा सकते हैं।`,
        ],
      },
      en: {
        h: 'Your rights',
        p: [
          'See and correct: all your data is visible in the app, and corrections are made with a new entry. With the "backup file" you can keep a full copy of your data yourself.',
          'Delete: use "Delete account" in Settings, or write to us. Withdraw consent: turn backup off or delete your account.',
          `Complaints: see the "Grievance Officer" page. We will reply within ${CONTACT.responseDays} days. If you are not satisfied you may approach the Data Protection Board of India.`,
        ],
      },
    },
    {
      hi: { h: 'बच्चे', p: ['यह ऐप बच्चों के लिए नहीं बना है। हम जानबूझकर 18 साल से कम उम्र के लोगों की जानकारी इकट्ठा नहीं करते।'] },
      en: { h: 'Children', p: ['This app is not made for children. We do not knowingly collect information from anyone under 18.'] },
    },
    {
      hi: { h: 'बदलाव', p: [`इस नीति में बदलाव होगा तो ऐप और इस पेज पर नई तारीख़ के साथ दिखेगा। आख़िरी बदलाव: ${LEGAL_UPDATED}।`] },
      en: { h: 'Changes', p: [`If this policy changes, the new version will appear in the app and on this page with a new date. Last updated: ${LEGAL_UPDATED}.`] },
    },
    {
      hi: { h: 'संपर्क', p: [`${CONTACT.operator} · ईमेल: ${CONTACT.email} · फ़ोन: ${CONTACT.phone}`] },
      en: { h: 'Contact', p: [`${CONTACT.operator} · Email: ${CONTACT.email} · Phone: ${CONTACT.phone}`] },
    },
  ],
};

const terms: LegalDoc = {
  id: 'terms',
  titleHi: 'नियम व शर्तें',
  titleEn: 'Terms and Conditions',
  summary: {
    hi: [
      'यह हिसाब लिखने की डायरी है, बैंक या कर्ज़ देने वाली सेवा नहीं।',
      'एंट्री सही लिखना आपकी ज़िम्मेदारी है। लिखी एंट्री मिटती नहीं, सुधार से नई बनती है।',
      'पिन और बैकअप का पासवर्ड भूले तो वापस नहीं मिलेगा।',
      'आप कभी भी अपना खाता हटा सकते हैं।',
    ],
    en: [
      'This is a record diary, not a bank or a lender.',
      'You are responsible for correct entries. Entries are not erased; a correction makes a new one.',
      'A forgotten PIN or backup password cannot be recovered.',
      'You can delete your account any time.',
    ],
  },
  sections: [
    {
      hi: { h: 'स्वीकार', p: ['नोतरा डायरी इस्तेमाल करने का मतलब है कि आप ये नियम मानते हैं। न मानें तो ऐप इस्तेमाल न करें।'] },
      en: { h: 'Acceptance', p: ['By using Notra Diary you agree to these terms. If you do not agree, please do not use the app.'] },
    },
    {
      hi: {
        h: 'ऐप क्या करता है, क्या नहीं',
        p: [
          'यह नोतरा के लेन-देन (आया और गया) को लिखने और देखने की डायरी है। यह बैंक, भुगतान ऐप या कर्ज़ देने वाली सेवा नहीं है। ऐप पैसे नहीं भेजता, नहीं लेता, और कोई कर्ज़ या ब्याज नहीं देता।',
          '"UPI" या "नकद" सिर्फ़ यह लिखने के लिए है कि लेन-देन कैसे हुआ; ऐप से कोई भुगतान नहीं होता।',
          '"लौटाना बाकी" और सुझाई गई रकम सिर्फ़ आपकी सुविधा के लिए गिनती है। यह कोई क़ानूनी दावा, कर्ज़ का प्रमाण या सलाह नहीं है। कितना लौटाना है यह आपका और आपके समाज का तय करने का काम है।',
        ],
      },
      en: {
        h: 'What the app does and does not do',
        p: [
          'It is a diary to write and see Notra transactions (received and given). It is not a bank, a payment app or a lending service. The app does not send or receive money, and gives no loans or interest.',
          '"UPI" or "cash" is only a note of how the exchange happened; no payment is made through the app.',
          '"Return pending" and the suggested amount are a convenience calculation only. They are not a legal claim, proof of a debt or advice. How much to return is for you and your community to decide.',
        ],
      },
    },
    {
      hi: {
        h: 'आपकी ज़िम्मेदारी',
        p: [
          'एंट्री सही लिखना आपकी ज़िम्मेदारी है। अपने फ़ोन और पिन को सुरक्षित रखें। पिन भूल जाने पर उसे वापस पाने का तरीका नहीं है।',
          'बैकअप फ़ाइल का पासवर्ड हम नहीं रखते; भूलने पर फ़ाइल कोई नहीं खोल सकता।',
          'किसी और के परिवार की जानकारी वही लिखें जो आपका अपना हिसाब रखने के लिए ज़रूरी है।',
        ],
      },
      en: {
        h: 'Your responsibility',
        p: [
          'You are responsible for writing entries correctly. Keep your phone and PIN safe. A forgotten PIN cannot be recovered.',
          'We do not keep the password of a backup file; if you forget it, nobody can open the file.',
          'Write about other families only what you need to keep your own record.',
        ],
      },
    },
    {
      hi: {
        h: 'एंट्री मिटती नहीं',
        p: ['जैसा हिसाब की बही में होता है, लिखी हुई एंट्री मिटाई नहीं जाती। गलती हो तो सुधार या "वापस" से नई एंट्री बनती है, और पुरानी हिसाब से हट जाती है पर रिकॉर्ड में रहती है।'],
      },
      en: {
        h: 'Entries are not erased',
        p: ['As in a ledger book, a written entry is not erased. For a mistake, a correction or "undo" creates a new entry; the old one stops counting but stays on record.'],
      },
    },
    {
      hi: {
        h: 'बैकअप और डेटा खोना',
        p: ['हम क्लाउड बैकअप पूरी कोशिश से सँभालते हैं, पर कोई गारंटी नहीं देते। ऐप "जैसा है वैसा" दिया जाता है। महत्वपूर्ण हिसाब की बैकअप फ़ाइल समय-समय पर अपने पास रखें।'],
      },
      en: {
        h: 'Backups and losing data',
        p: ['We run cloud backup with care but give no guarantee. The app is provided "as is". Keep a backup file of important records from time to time.'],
      },
    },
    {
      hi: {
        h: 'सही इस्तेमाल',
        p: ['ऐप का इस्तेमाल क़ानून के खिलाफ़ या किसी को परेशान करने के लिए न करें। ऐप या सर्वर को बिगाड़ने, या दूसरों के खाते में घुसने की कोशिश न करें।'],
      },
      en: {
        h: 'Proper use',
        p: ["Do not use the app against the law or to harass anyone. Do not try to damage the app or server, or to get into other people's accounts."],
      },
    },
    {
      hi: {
        h: 'खाता और हटाना',
        p: ['आप कभी भी सेटिंग में "खाता हटाएं" से अपना क्लाउड खाता और उसका डेटा हटा सकते हैं। नियम तोड़ने पर हम किसी खाते का क्लाउड इस्तेमाल बंद कर सकते हैं; आपके फ़ोन का डेटा फिर भी आपके पास रहेगा।'],
      },
      en: {
        h: 'Account and deletion',
        p: ['You can delete your cloud account and its data any time with "Delete account" in Settings. We may stop cloud use for an account that breaks these terms; the data on your phone stays with you.'],
      },
    },
    {
      hi: { h: 'मुफ़्त और बदलाव', p: ['ऐप मुफ़्त है और विज्ञापनों से चलता है (गोपनीयता नीति में "विज्ञापन" देखें)। हम ऐप और ये नियम बदल सकते हैं; बड़ा बदलाव होगा तो ऐप में बताएँगे।'] },
      en: { h: 'Free of charge, and changes', p: ['The app is free and supported by ads (see "Advertising" in the Privacy Policy). We may change the app and these terms; for a major change we will tell you in the app.'] },
    },
    {
      hi: { h: 'हमारी ज़िम्मेदारी की सीमा', p: ['क़ानून जितनी इजाज़त देता है, उतना ही: ऐप के इस्तेमाल से हुए किसी अप्रत्यक्ष नुकसान, डेटा खोने या लेन-देन के विवाद के लिए हम ज़िम्मेदार नहीं हैं।'] },
      en: { h: 'Limit of our liability', p: ['To the extent the law allows: we are not liable for indirect loss, lost data or any dispute about a transaction arising from use of the app.'] },
    },
    {
      hi: { h: 'क़ानून', p: ['इन नियमों पर भारत का क़ानून लागू होगा। पहले हमसे बात करें: शिकायत अधिकारी का पेज देखें।'] },
      en: { h: 'Law', p: ['Indian law applies to these terms. Please talk to us first: see the Grievance Officer page.'] },
    },
    {
      hi: { h: 'संपर्क', p: [`${CONTACT.operator} · ईमेल: ${CONTACT.email} · फ़ोन: ${CONTACT.phone} · आख़िरी बदलाव: ${LEGAL_UPDATED}`] },
      en: { h: 'Contact', p: [`${CONTACT.operator} · Email: ${CONTACT.email} · Phone: ${CONTACT.phone} · Last updated: ${LEGAL_UPDATED}`] },
    },
  ],
};

const grievance: LegalDoc = {
  id: 'grievance',
  titleHi: 'शिकायत अधिकारी',
  titleEn: 'Grievance Officer',
  summary: {
    hi: [
      'शिकायत या डेटा हटवाने के लिए यहाँ लिखें।',
      'हम 30 दिन के अंदर जवाब देंगे।',
      'पिन, पासवर्ड या OTP कभी न भेजें।',
    ],
    en: [
      'Write here for a complaint or to have data deleted.',
      'We will reply within 30 days.',
      'Never send a PIN, password or OTP.',
    ],
  },
  sections: [
    {
      hi: {
        h: 'शिकायत कहाँ करें',
        p: [
          'अपने डेटा या गोपनीयता से जुड़ी कोई भी शिकायत, सुधार या हटाने का अनुरोध इन्हें भेजें:',
          `नाम: ${CONTACT.officerName}`,
          `ईमेल: ${CONTACT.email}`,
          `फ़ोन: ${CONTACT.phone}`,
          `पता: ${CONTACT.address}`,
        ],
      },
      en: {
        h: 'Where to complain',
        p: [
          'Send any complaint about your data or privacy, a correction request or a deletion request to:',
          `Name: ${CONTACT.officerName}`,
          `Email: ${CONTACT.email}`,
          `Phone: ${CONTACT.phone}`,
          `Address: ${CONTACT.address}`,
        ],
      },
    },
    {
      hi: {
        h: 'जवाब का समय',
        p: [
          `हम शिकायत मिलने के बाद ${CONTACT.responseDays} दिन के अंदर आपको जवाब देंगे।`,
          'लिखते समय अपना नाम, ऐप में साइन इन किया हुआ मोबाइल नंबर या Google ईमेल, और बात संक्षेप में लिखें। पासवर्ड, पिन या OTP कभी न भेजें।',
          'जवाब से संतुष्टि न हो तो आप भारत के डेटा संरक्षण बोर्ड (Data Protection Board of India) के पास जा सकते हैं।',
        ],
      },
      en: {
        h: 'Response time',
        p: [
          `We will reply within ${CONTACT.responseDays} days of receiving your complaint.`,
          'When writing, give your name, the mobile number or Google email you signed in with, and a short description. Never send a password, PIN or OTP.',
          'If you are not satisfied with the reply you may approach the Data Protection Board of India.',
        ],
      },
    },
  ],
};

const deleteAccount: LegalDoc = {
  id: 'delete-account',
  titleHi: 'खाता और डेटा हटाएं',
  titleEn: 'Delete your account and data',
  summary: {
    hi: [
      'ऐप में: सेटिंग, फिर "खाता हटाएं"।',
      'सर्वर से आपका सब डेटा तुरंत हट जाता है।',
      'ऐप न खुले तो ईमेल करें।',
    ],
    en: [
      'In the app: Settings, then "Delete account".',
      'All your data is removed from our server at once.',
      'If the app will not open, send an email.',
    ],
  },
  sections: [
    {
      hi: {
        h: 'ऐप से हटाने का तरीका',
        p: [
          'नोतरा डायरी खोलें → सेटिंग → "खाता हटाएं"।',
          'चेतावनी पढ़ें, "हटाएं" टाइप करें और पक्का करें। फिर ऐप पूछेगा कि इस फ़ोन का डेटा भी मिटाना है या नहीं।',
          'यह वापस नहीं हो सकता।',
        ],
      },
      en: {
        h: 'How to delete from the app',
        p: [
          'Open Notra Diary → Settings → "Delete account" (खाता हटाएं).',
          'Read the warning, type the word shown ("हटाएं") and confirm. The app will then ask whether to also erase this phone\'s data.',
          'This cannot be undone.',
        ],
      },
    },
    {
      hi: {
        h: 'क्या हटता है',
        p: [
          'हमारे सर्वर से आपके परिवार, कार्यक्रम, एंट्री, खाते, आपकी प्रोफ़ाइल, साइन इन की जानकारी (Google पहचान या मोबाइल नंबर) और OTP के रिकॉर्ड, सब उसी समय हट जाते हैं।',
          'आपके फ़ोन का डेटा तब तक रहता है जब तक आप ऐप में उसे मिटाने के लिए "हाँ" न कहें, या ऐप हटा न दें।',
        ],
      },
      en: {
        h: 'What is deleted',
        p: [
          'From our server: your families, events, entries, ledgers, your profile, your sign-in details (Google ID or mobile number) and OTP records, all removed immediately.',
          'The data on your phone stays until you say "yes" to erase it in the app, or uninstall the app.',
        ],
      },
    },
    {
      hi: {
        h: 'ऐप नहीं खुल रही हो तो',
        p: [`${CONTACT.email} पर लिखें, साइन इन वाला मोबाइल नंबर या Google ईमेल बताएँ। पहचान की पुष्टि के बाद हम ${CONTACT.responseDays} दिन के अंदर खाता हटा देंगे।`],
      },
      en: {
        h: 'If you cannot open the app',
        p: [`Write to ${CONTACT.email} with the mobile number or Google email you signed in with. After verifying it is you, we will delete the account within ${CONTACT.responseDays} days.`],
      },
    },
  ],
};

export const LEGAL: Record<LegalId, LegalDoc> = {
  privacy,
  terms,
  grievance,
  'delete-account': deleteAccount,
};
