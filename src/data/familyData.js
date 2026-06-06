/**
 * Family Data - Matches Web App (footprint-web-app)
 * 
 * Data structure for family tree display.
 * Ready for API integration - format matches backend /api/family/branch endpoint.
 */

// Family Branch Data - Hierarchical tree view
export const FAMILY_BRANCH_DATA = {
  branches: [
    {
      id: 'head1',
      name: 'Akram Naser',
      birthYear: 1965,
      avatar: 'https://ca.slack-edge.com/T06935G3G-U06935GCH-g283c390a854-512',
      isMe: true,
      spouse: {
        id: 'wife1',
        name: 'Sawsan Alsuos',
        role: 'wife',
        avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
      },
      children: [
        { id: 'ch1', name: 'Reem Naser', avatar: 'https://randomuser.me/api/portraits/women/20.jpg' },
        { id: 'ch2', name: 'Rana Naser', avatar: 'https://randomuser.me/api/portraits/women/21.jpg' },
        { id: 'ch3', name: 'Amar Naser', avatar: 'https://randomuser.me/api/portraits/men/20.jpg' },
      ],
    },
    {
      id: 'head2',
      name: 'Mahnoud Naser',
      birthYear: 1965,
      avatar: 'https://randomuser.me/api/portraits/men/71.jpg',
      spouse: {
        id: 'wife2',
        name: 'Adila Murar',
        role: 'wife',
        avatar: 'https://randomuser.me/api/portraits/women/66.jpg',
      },
      children: [
        { id: 'ch4', name: 'Asmar Naser', avatar: 'https://randomuser.me/api/portraits/women/46.jpg' },
        { id: 'ch5', name: 'Akram Naser', avatar: 'https://randomuser.me/api/portraits/men/40.jpg' },
        { id: 'ch6', name: 'Amjad Naser', avatar: 'https://randomuser.me/api/portraits/men/32.jpg' },
      ],
    },
    {
      id: 'head3',
      name: 'AbdelRhman Naser',
      birthYear: 1965,
      avatar: 'https://randomuser.me/api/portraits/men/75.jpg',
      spouse: {
        id: 'wife3',
        name: 'Fatima Ahmad',
        role: 'wife',
        avatar: 'https://randomuser.me/api/portraits/women/75.jpg',
      },
      children: [
        { id: 'ch7', name: 'Nadih Naser', avatar: 'https://randomuser.me/api/portraits/men/68.jpg' },
      ],
    },
  ],
};

// Family List Data - Flat list view
export const FAMILY_LIST_DATA = {
  families: [
    {
      id: 'head1',
      name: 'Akram Naser',
      role: 'Husband',
      avatar: 'https://ca.slack-edge.com/T06935G3G-U06935GCH-g283c390a854-512',
      isMe: true,
      spouse: {
        id: 'wife1',
        name: 'Sawsan Alsuos',
        role: 'wife',
        avatar: 'https://randomuser.me/api/portraits/women/44.jpg',
      },
      children: [
        { id: 'ch1', name: 'Reem Naser', avatar: 'https://randomuser.me/api/portraits/women/20.jpg' },
        { id: 'ch2', name: 'Rana Naser', avatar: 'https://randomuser.me/api/portraits/women/21.jpg' },
        { id: 'ch3', name: 'Amar Naser', avatar: 'https://randomuser.me/api/portraits/men/20.jpg' },
      ],
    },
    {
      id: 'head2',
      name: 'Mahnoud Naser',
      role: 'Husband',
      avatar: 'https://randomuser.me/api/portraits/men/71.jpg',
      spouse: {
        id: 'wife2',
        name: 'Adila Murar',
        role: 'wife',
        avatar: 'https://randomuser.me/api/portraits/women/66.jpg',
      },
      children: [
        { id: 'ch4', name: 'Asmar Naser', avatar: 'https://randomuser.me/api/portraits/women/46.jpg' },
        { id: 'ch5', name: 'Akram Naser', avatar: 'https://randomuser.me/api/portraits/men/40.jpg' },
        { id: 'ch6', name: 'Amjad Naser', avatar: 'https://randomuser.me/api/portraits/men/32.jpg' },
      ],
    },
    {
      id: 'head3',
      name: 'AbdelRhman Naser',
      role: 'Husband',
      avatar: 'https://randomuser.me/api/portraits/men/75.jpg',
      spouse: {
        id: 'wife3',
        name: 'Fatima Ahmad',
        role: 'wife',
        avatar: 'https://randomuser.me/api/portraits/women/75.jpg',
      },
      children: [
        { id: 'ch7', name: 'Nadih Naser', avatar: 'https://randomuser.me/api/portraits/men/68.jpg' },
      ],
    },
  ],
};
