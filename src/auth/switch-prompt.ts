import { Alert } from 'react-native';
import type { AskChoice, SignInChoice } from '@/sync/account';

const TITLE = 'इस फ़ोन का डेटा इस खाते में जोड़ें?';

/**
 * Asked when the account that just signed in does not match the data on this phone (someone else's data, or data that was
 * never saved to any account). Nothing is uploaded until the person answers. Dismissing the dialog counts as "रद्द करें".
 */
export const askAddPhoneData: AskChoice = ({ neverSynced }) =>
  new Promise<SignInChoice>((resolve) => {
    const body = neverSynced
      ? 'इस फ़ोन पर हिसाब पहले से है, जो अभी किसी खाते में सेव नहीं है। उसे इस खाते में जोड़ सकते हैं।'
      : 'इस फ़ोन पर किसी और खाते का हिसाब है। उसे इस खाते में जोड़ें, या पहले फ़ोन साफ़ करें, या रद्द करें।';
    const wipe = () =>
      Alert.alert(
        'फ़ोन साफ़ करें?',
        neverSynced
          ? 'इस फ़ोन का सारा हिसाब हमेशा के लिए मिट जाएगा। वह कहीं और सेव नहीं है। फिर इस खाते का हिसाब वापस आएगा।'
          : 'इस फ़ोन का हिसाब मिट जाएगा। फिर इस खाते का अपना हिसाब वापस आएगा। पिछले खाते का हिसाब उसके क्लाउड पर बना रहेगा।',
        [
          { text: 'रुकें', style: 'cancel', onPress: () => resolve('cancel') },
          { text: 'हाँ, साफ़ करें', style: 'destructive', onPress: () => resolve('wipe') },
        ],
        { cancelable: true, onDismiss: () => resolve('cancel') },
      );
    Alert.alert(
      TITLE,
      body,
      [
        { text: 'जोड़ें', onPress: () => resolve('merge') },
        { text: 'पहले फ़ोन साफ़ करें', style: 'destructive', onPress: wipe },
        { text: 'रद्द करें', style: 'cancel', onPress: () => resolve('cancel') },
      ],
      { cancelable: true, onDismiss: () => resolve('cancel') },
    );
  });
