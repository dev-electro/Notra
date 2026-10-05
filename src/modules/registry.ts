import type { IconName } from '@/components/icons';

export type ModuleId = 'notra' | 'rishtey' | 'checkin' | 'rewards' | 'referral' | 'videos';

export interface AppModule {
  id: ModuleId;
  /** Hindi name. */
  title: string;
  icon: IconName;
  route: string;
  status: 'live' | 'soon';
  /** Key in FEATURES and in the server's features.<flag>. */
  flag: ModuleId;
  /** Two short Hindi lines for the "coming soon" page. */
  blurb: string;
}

/** Every module of the app. All are live; the rewards modules (checkin, rewards, referral, videos) live on the इनाम tab. A module that is not built yet would use status 'soon' and open /soon/<id>. */
export const MODULES: readonly AppModule[] = [
  { id: 'notra', title: 'नोतरा बुक', icon: 'kalash', route: '/notra', status: 'live', flag: 'notra', blurb: '' },
  { id: 'rishtey', title: 'रिश्ते', icon: 'families', route: '/rishte', status: 'live', flag: 'rishtey', blurb: 'अपनी बिरादरी में अच्छे रिश्ते खोजें।\nजानकारी सुरक्षित, बात आपकी मर्ज़ी से।' },
  { id: 'checkin', title: 'रोज़ हाज़िरी', icon: 'calendar', route: '/inaam', status: 'live', flag: 'checkin', blurb: 'रोज़ एक बटन दबाएँ, इनाम पाएँ।\nलगातार आने पर और ज़्यादा इनाम।' },
  { id: 'rewards', title: 'इनाम पाएँ', icon: 'cash', route: '/inaam', status: 'live', flag: 'rewards', blurb: 'हाज़िरी, दोस्त और वीडियो से कमाई जमा करें।\nअपनी कमाई का हिसाब एक जगह।' },
  { id: 'referral', title: 'दोस्त बुलाएँ', icon: 'share', route: '/inaam', status: 'live', flag: 'referral', blurb: 'दोस्तों और रिश्तेदारों को नोतरा बुक पर बुलाएँ।\nहर नए साथी पर इनाम पाएँ।' },
  { id: 'videos', title: 'वीडियो देखें', icon: 'camera', route: '/inaam', status: 'live', flag: 'videos', blurb: 'छोटे वीडियो देखें और इनाम पाएँ।\nजब मन करे तब, कोई मजबूरी नहीं।' },
];

export const getModule = (id: string): AppModule | undefined => MODULES.find((m) => m.id === id);
