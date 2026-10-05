/**
 * First-launch picture cards, narrated in Hindi (expo-speech). `speech` is what is read aloud; it repeats the card text in
 * simple spoken Hindi. Four cards, no jargon, no English.
 */
export interface OnboardingCard {
  id: string;
  /** Big picture (an emoji, so there is nothing to download and nothing to load). */
  picture: string;
  title: string;
  body: string;
  speech: string;
}

export const ONBOARDING_CARDS: readonly OnboardingCard[] = [
  {
    id: 'diary',
    picture: '📒',
    title: 'नोतरा का हिसाब, अब फ़ोन में',
    body: 'किसके यहाँ से क्या आया, और किसके यहाँ क्या गया, सब एक जगह लिखा रहेगा।',
    speech: 'नोतरा डायरी में आप नोतरा का पूरा हिसाब रखते हैं। किसके यहाँ से क्या आया, और किसके यहाँ क्या गया, सब एक जगह लिखा रहेगा।',
  },
  {
    id: 'write',
    picture: '✍️',
    title: 'बोलकर या छूकर लिखें',
    body: 'परिवार चुनें, रकम दबाएँ, बस। ऐप पढ़कर भी सुनाता है कि क्या लिखा।',
    speech: 'परिवार चुनिए, रकम दबाइए, बस हो गया। ऐप पढ़कर भी सुनाता है कि आपने क्या लिखा। चाहें तो बोलकर भी लिख सकते हैं।',
  },
  {
    id: 'safe',
    picture: '🔒',
    title: 'बिना इंटरनेट, आपका अपना',
    body: 'सारा हिसाब आपके फ़ोन में सुरक्षित रहता है। इंटरनेट न हो तब भी ऐप पूरा चलता है।',
    speech: 'आपका सारा हिसाब आपके अपने फ़ोन में सुरक्षित रहता है। इंटरनेट न हो, तब भी ऐप पूरा चलता है। चाहें तो परिवार की औरतें अपना अलग खाता भी पिन लगाकर रख सकती हैं।',
  },
  {
    id: 'backup',
    picture: '☁️',
    title: 'चाहें तो बैकअप',
    body: 'साइन इन करके हिसाब की कॉपी रख सकते हैं, ताकि फ़ोन खोए तो हिसाब वापस मिले। यह आपकी मर्ज़ी है।',
    speech: 'अगर आप चाहें तो साइन इन करके हिसाब की एक कॉपी रख सकते हैं, ताकि फ़ोन खो जाए या बदलें, तो हिसाब वापस मिल जाए। यह पूरी तरह आपकी मर्ज़ी है।',
  },
];
