/**
 * Profile Service - handles all profile-related API calls to Footprint.Users service
 */

const USERS_API_BASE_URL = 'http://localhost:5200';
const API_VERSION = 'v1';

/**
 * Base fetch with auth header
 */
const authFetch = async (endpoint, accessToken, options = {}) => {
  const response = await fetch(`${USERS_API_BASE_URL}/api/${API_VERSION}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const error = new Error(errorData.message || `Request failed with status ${response.status}`);
    error.status = response.status;
    error.data = errorData;
    throw error;
  }

  // Handle no content response
  if (response.status === 204) {
    return null;
  }

  return response.json();
};

// ==================== EDUCATION ====================

/**
 * Add education entry
 * @param {string} accessToken 
 * @param {Object} education - { institution, degree, field, startYear, endYear, gpa, description }
 */
export const addEducation = async (accessToken, education) => {
  return authFetch('/users/me/education', accessToken, {
    method: 'POST',
    body: JSON.stringify(education),
  });
};

/**
 * Update education entry
 * @param {string} accessToken 
 * @param {string} educationId 
 * @param {Object} education 
 */
export const updateEducation = async (accessToken, educationId, education) => {
  return authFetch(`/users/me/education/${educationId}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(education),
  });
};

/**
 * Delete education entry
 * @param {string} accessToken 
 * @param {string} educationId 
 */
export const deleteEducation = async (accessToken, educationId) => {
  return authFetch(`/users/me/education/${educationId}`, accessToken, {
    method: 'DELETE',
  });
};

// ==================== EMPLOYMENT ====================

/**
 * Add employment entry
 * @param {string} accessToken 
 * @param {Object} employment - { company, title, startDate, endDate, isCurrent, location, description }
 */
export const addEmployment = async (accessToken, employment) => {
  return authFetch('/users/me/employment', accessToken, {
    method: 'POST',
    body: JSON.stringify(employment),
  });
};

/**
 * Update employment entry
 * @param {string} accessToken 
 * @param {string} employmentId 
 * @param {Object} employment 
 */
export const updateEmployment = async (accessToken, employmentId, employment) => {
  return authFetch(`/users/me/employment/${employmentId}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(employment),
  });
};

/**
 * Delete employment entry
 * @param {string} accessToken 
 * @param {string} employmentId 
 */
export const deleteEmployment = async (accessToken, employmentId) => {
  return authFetch(`/users/me/employment/${employmentId}`, accessToken, {
    method: 'DELETE',
  });
};

// ==================== ADDRESSES ====================

/**
 * Add address entry
 * @param {string} accessToken 
 * @param {Object} address - { label, street, city, state, country, postalCode, startYear, endYear }
 */
export const addAddress = async (accessToken, address) => {
  return authFetch('/users/me/addresses', accessToken, {
    method: 'POST',
    body: JSON.stringify(address),
  });
};

/**
 * Update address entry
 * @param {string} accessToken 
 * @param {string} addressId 
 * @param {Object} address 
 */
export const updateAddress = async (accessToken, addressId, address) => {
  return authFetch(`/users/me/addresses/${addressId}`, accessToken, {
    method: 'PUT',
    body: JSON.stringify(address),
  });
};

/**
 * Delete address entry
 * @param {string} accessToken 
 * @param {string} addressId 
 */
export const deleteAddress = async (accessToken, addressId) => {
  return authFetch(`/users/me/addresses/${addressId}`, accessToken, {
    method: 'DELETE',
  });
};

// ==================== ETHNICITY PROFILE ====================

/**
 * Update ethnicity profile
 * @param {string} accessToken 
 * @param {Object} ethnicityProfile - { components: [{ name, percentage, color }], ancestryResults: [{ heritage, description, percentage }] }
 */
export const updateEthnicityProfile = async (accessToken, ethnicityProfile) => {
  return authFetch('/users/me/ethnicity', accessToken, {
    method: 'PUT',
    body: JSON.stringify(ethnicityProfile),
  });
};

// ==================== FAMILY ====================

/**
 * Get family links
 * @param {string} accessToken 
 * @param {string} status - Optional: 'Pending', 'Accepted', 'Declined', 'Blocked'
 */
export const getFamilyLinks = async (accessToken, status = null) => {
  const query = status ? `?status=${status}` : '';
  return authFetch(`/users/me/family${query}`, accessToken);
};

/**
 * Get pending family invitations
 * @param {string} accessToken 
 */
export const getFamilyInvitations = async (accessToken) => {
  return authFetch('/users/me/family/invitations', accessToken);
};

/**
 * Create family link request
 * @param {string} accessToken 
 * @param {Object} familyLink - { relatedUserIdentifier, relationship, customLabel, notes }
 */
export const createFamilyLink = async (accessToken, familyLink) => {
  return authFetch('/users/me/family', accessToken, {
    method: 'POST',
    body: JSON.stringify(familyLink),
  });
};

/**
 * Respond to family invitation
 * @param {string} accessToken 
 * @param {string} invitationId 
 * @param {boolean} accept 
 */
export const respondToFamilyInvitation = async (accessToken, invitationId, accept) => {
  return authFetch(`/users/me/family/invitations/${invitationId}/respond`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
};

/**
 * Update family link
 * @param {string} accessToken 
 * @param {string} linkId 
 * @param {Object} updates - { relationship, customLabel, notes }
 */
export const updateFamilyLink = async (accessToken, linkId, updates) => {
  return authFetch(`/users/me/family/${linkId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

/**
 * Delete family link
 * @param {string} accessToken 
 * @param {string} linkId 
 */
export const deleteFamilyLink = async (accessToken, linkId) => {
  return authFetch(`/users/me/family/${linkId}`, accessToken, {
    method: 'DELETE',
  });
};

// ==================== FRIENDS ====================

/**
 * Get friends list
 * @param {string} accessToken 
 * @param {Object} filters - { status, category }
 */
export const getFriends = async (accessToken, filters = {}) => {
  const params = new URLSearchParams();
  if (filters.status) params.append('status', filters.status);
  if (filters.category) params.append('category', filters.category);
  const query = params.toString() ? `?${params.toString()}` : '';
  return authFetch(`/users/me/friends${query}`, accessToken);
};

/**
 * Get pending friend requests
 * @param {string} accessToken 
 */
export const getFriendRequests = async (accessToken) => {
  return authFetch('/users/me/friends/requests', accessToken);
};

/**
 * Send friend request
 * @param {string} accessToken 
 * @param {Object} friendRequest - { friendIdentifier, category, customCategory, nickname, notes }
 */
export const sendFriendRequest = async (accessToken, friendRequest) => {
  return authFetch('/users/me/friends', accessToken, {
    method: 'POST',
    body: JSON.stringify(friendRequest),
  });
};

/**
 * Respond to friend request
 * @param {string} accessToken 
 * @param {string} requestId 
 * @param {boolean} accept 
 */
export const respondToFriendRequest = async (accessToken, requestId, accept) => {
  return authFetch(`/users/me/friends/requests/${requestId}/respond`, accessToken, {
    method: 'POST',
    body: JSON.stringify({ accept }),
  });
};

/**
 * Update friend link
 * @param {string} accessToken 
 * @param {string} linkId 
 * @param {Object} updates - { category, customCategory, nickname, notes }
 */
export const updateFriendLink = async (accessToken, linkId, updates) => {
  return authFetch(`/users/me/friends/${linkId}`, accessToken, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
};

/**
 * Remove friend
 * @param {string} accessToken 
 * @param {string} linkId 
 */
export const removeFriend = async (accessToken, linkId) => {
  return authFetch(`/users/me/friends/${linkId}`, accessToken, {
    method: 'DELETE',
  });
};

// ==================== USER SEARCH ====================

/**
 * Search for users by name
 * @param {string} accessToken 
 * @param {string} query 
 * @param {number} limit 
 */
export const searchUsers = async (accessToken, query, limit = 20) => {
  return authFetch(`/users/search?q=${encodeURIComponent(query)}&limit=${limit}`, accessToken);
};

export default {
  // Education
  addEducation,
  updateEducation,
  deleteEducation,
  // Employment
  addEmployment,
  updateEmployment,
  deleteEmployment,
  // Addresses
  addAddress,
  updateAddress,
  deleteAddress,
  // Ethnicity
  updateEthnicityProfile,
  // Family
  getFamilyLinks,
  getFamilyInvitations,
  createFamilyLink,
  respondToFamilyInvitation,
  updateFamilyLink,
  deleteFamilyLink,
  // Friends
  getFriends,
  getFriendRequests,
  sendFriendRequest,
  respondToFriendRequest,
  updateFriendLink,
  removeFriend,
  // Search
  searchUsers,
};
