/**
 * Friends Data - Matches Web App (footprint-web-app)
 * 
 * Data structure for friends display.
 * Ready for API integration.
 */

// Friends List Data - Detailed view with personal info
export const FRIENDS_LIST_DATA = [
  {
    id: 1,
    name: 'Manal Ahmad',
    avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
    location: 'Los Angeles, United States',
    birthday: '24 November 1988',
    education: 'UCLA',
    work: 'Microsoft',
  },
  {
    id: 2,
    name: 'Aya Ahmad',
    avatar: 'https://randomuser.me/api/portraits/women/45.jpg',
    location: 'Los Angeles, United States',
    birthday: '24 November 1988',
    education: 'UCLA',
    work: 'Microsoft',
  },
  {
    id: 3,
    name: 'Huda Ahmo',
    avatar: 'https://randomuser.me/api/portraits/women/46.jpg',
    location: 'Los Angeles, United States',
    birthday: '24 November 1988',
    education: 'UCLA',
    work: null,
  },
  {
    id: 4,
    name: 'Sara Johnson',
    avatar: 'https://randomuser.me/api/portraits/women/48.jpg',
    location: 'Seattle, United States',
    birthday: '15 March 1990',
    education: 'Stanford University',
    work: 'Google',
  },
  {
    id: 5,
    name: 'Jamal Ahmad',
    avatar: 'https://randomuser.me/api/portraits/men/32.jpg',
    location: 'New York, United States',
    birthday: '8 July 1985',
    education: 'MIT',
    work: 'Amazon',
  },
];

// Friends Tree Data - Hierarchical view by organization
export const FRIENDS_TREE_DATA = {
  user: {
    name: 'Akram Naser',
    birthYear: 'Born 1965',
    avatar: 'https://ca.slack-edge.com/T06935G3G-U06935GCH-g283c390a854-512',
  },
  categories: [
    {
      id: 'education',
      name: 'Education',
      icon: 'school', // Ionicons name
      organizations: [
        {
          id: 1,
          name: 'MIT',
          logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/MIT_logo.svg/200px-MIT_logo.svg.png',
          friends: [
            { id: 1, name: 'Manal Ahmad', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/women/44.jpg' },
            { id: 2, name: 'Aya Ahmad', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/women/45.jpg' },
            { id: 3, name: 'Huda Mohamad', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/women/46.jpg' },
            { id: 4, name: 'Rana Aliof', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/women/47.jpg' },
          ],
        },
        {
          id: 2,
          name: 'Stanford University',
          logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Stanford_Cardinal_logo.svg/200px-Stanford_Cardinal_logo.svg.png',
          friends: [
            { id: 5, name: 'Jamal Ahmad', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/men/32.jpg' },
            { id: 6, name: 'Ali Yossef Alla', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/men/33.jpg' },
            { id: 7, name: 'Jafar Ahmmad', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/men/34.jpg' },
            { id: 8, name: 'Khaled Ahmad', location: 'Delhi, India', avatar: 'https://randomuser.me/api/portraits/men/35.jpg' },
          ],
        },
      ],
    },
    {
      id: 'work',
      name: 'Work',
      icon: 'briefcase', // Ionicons name
      organizations: [
        {
          id: 3,
          name: 'Microsoft',
          logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/44/Microsoft_logo.svg/200px-Microsoft_logo.svg.png',
          friends: [
            { id: 9, name: 'Sara Johnson', location: 'Seattle, USA', avatar: 'https://randomuser.me/api/portraits/women/48.jpg' },
            { id: 10, name: 'Mike Chen', location: 'Seattle, USA', avatar: 'https://randomuser.me/api/portraits/men/36.jpg' },
          ],
        },
        {
          id: 4,
          name: 'Google',
          logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/Google_2015_logo.svg/200px-Google_2015_logo.svg.png',
          friends: [
            { id: 11, name: 'Emily Davis', location: 'Mountain View, USA', avatar: 'https://randomuser.me/api/portraits/women/49.jpg' },
            { id: 12, name: 'James Wilson', location: 'Mountain View, USA', avatar: 'https://randomuser.me/api/portraits/men/37.jpg' },
          ],
        },
      ],
    },
  ],
};
