/**
 * LocationService
 * 
 * Handles location-related functionality:
 * - Permission requests
 * - Current location retrieval
 * - Reverse geocoding (coordinates to address)
 * - Location watching for real-time updates
 */

import * as Location from 'expo-location';

const TAG = '[LocationService]';

/**
 * Location accuracy levels
 */
export const LocationAccuracy = {
  LOWEST: Location.Accuracy.Lowest,
  LOW: Location.Accuracy.Low,
  BALANCED: Location.Accuracy.Balanced,
  HIGH: Location.Accuracy.High,
  HIGHEST: Location.Accuracy.Highest,
  BEST_FOR_NAVIGATION: Location.Accuracy.BestForNavigation,
};

/**
 * Permission status
 */
export const PermissionStatus = {
  GRANTED: 'granted',
  DENIED: 'denied',
  UNDETERMINED: 'undetermined',
};

class LocationServiceClass {
  constructor() {
    this.watchSubscription = null;
    this.lastKnownLocation = null;
    this.permissionStatus = PermissionStatus.UNDETERMINED;
  }

  /**
   * Request location permissions
   * @returns {Promise<{foreground: string, background: string}>}
   */
  async requestPermissions() {
    console.log(TAG, 'Requesting location permissions...');
    
    try {
      // Request foreground permission first
      const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
      console.log(TAG, 'Foreground permission:', foregroundStatus);
      
      let backgroundStatus = PermissionStatus.UNDETERMINED;
      
      // Only request background if foreground is granted
      if (foregroundStatus === PermissionStatus.GRANTED) {
        const { status } = await Location.requestBackgroundPermissionsAsync();
        backgroundStatus = status;
        console.log(TAG, 'Background permission:', backgroundStatus);
      }
      
      this.permissionStatus = foregroundStatus;
      
      return {
        foreground: foregroundStatus,
        background: backgroundStatus,
      };
    } catch (error) {
      console.error(TAG, 'Error requesting permissions:', error);
      throw error;
    }
  }

  /**
   * Check current permission status
   * @returns {Promise<{foreground: string, background: string}>}
   */
  async checkPermissions() {
    try {
      const { status: foregroundStatus } = await Location.getForegroundPermissionsAsync();
      const { status: backgroundStatus } = await Location.getBackgroundPermissionsAsync();
      
      this.permissionStatus = foregroundStatus;
      
      return {
        foreground: foregroundStatus,
        background: backgroundStatus,
      };
    } catch (error) {
      console.error(TAG, 'Error checking permissions:', error);
      throw error;
    }
  }

  /**
   * Check if location services are enabled on device
   * @returns {Promise<boolean>}
   */
  async isLocationEnabled() {
    try {
      return await Location.hasServicesEnabledAsync();
    } catch (error) {
      console.error(TAG, 'Error checking location services:', error);
      return false;
    }
  }

  /**
   * Get current location
   * @param {Object} options
   * @param {number} options.accuracy - Location accuracy level
   * @param {number} options.timeout - Timeout in milliseconds
   * @returns {Promise<{latitude: number, longitude: number, altitude: number, accuracy: number, timestamp: number}>}
   */
  async getCurrentLocation(options = {}) {
    const {
      accuracy = LocationAccuracy.BALANCED,
      timeout = 15000,
    } = options;

    console.log(TAG, 'Getting current location...');

    try {
      // Check permission first
      if (this.permissionStatus !== PermissionStatus.GRANTED) {
        const { foreground } = await this.requestPermissions();
        if (foreground !== PermissionStatus.GRANTED) {
          throw new Error('Location permission not granted');
        }
      }

      // Get location with timeout
      const location = await Promise.race([
        Location.getCurrentPositionAsync({
          accuracy,
        }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Location request timed out')), timeout)
        ),
      ]);

      this.lastKnownLocation = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        altitude: location.coords.altitude,
        accuracy: location.coords.accuracy,
        timestamp: location.timestamp,
      };

      console.log(TAG, 'Location retrieved:', this.lastKnownLocation);
      return this.lastKnownLocation;
    } catch (error) {
      console.error(TAG, 'Error getting current location:', error);
      throw error;
    }
  }

  /**
   * Get last known location (faster, may be stale)
   * @returns {Promise<{latitude: number, longitude: number, altitude: number, accuracy: number, timestamp: number} | null>}
   */
  async getLastKnownLocation() {
    try {
      const location = await Location.getLastKnownPositionAsync();
      
      if (location) {
        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          altitude: location.coords.altitude,
          accuracy: location.coords.accuracy,
          timestamp: location.timestamp,
        };
      }
      
      return this.lastKnownLocation;
    } catch (error) {
      console.error(TAG, 'Error getting last known location:', error);
      return this.lastKnownLocation;
    }
  }

  /**
   * Start watching location updates
   * @param {Function} callback - Called with location updates
   * @param {Object} options
   * @param {number} options.accuracy - Location accuracy level
   * @param {number} options.distanceInterval - Minimum distance (meters) between updates
   * @param {number} options.timeInterval - Minimum time (ms) between updates
   * @returns {Promise<void>}
   */
  async startWatching(callback, options = {}) {
    const {
      accuracy = LocationAccuracy.BALANCED,
      distanceInterval = 10,
      timeInterval = 5000,
    } = options;

    console.log(TAG, 'Starting location watch...');

    // Stop any existing watch
    await this.stopWatching();

    try {
      // Check permission
      if (this.permissionStatus !== PermissionStatus.GRANTED) {
        const { foreground } = await this.requestPermissions();
        if (foreground !== PermissionStatus.GRANTED) {
          throw new Error('Location permission not granted');
        }
      }

      this.watchSubscription = await Location.watchPositionAsync(
        {
          accuracy,
          distanceInterval,
          timeInterval,
        },
        (location) => {
          const coords = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            altitude: location.coords.altitude,
            accuracy: location.coords.accuracy,
            timestamp: location.timestamp,
          };
          
          this.lastKnownLocation = coords;
          callback(coords);
        }
      );

      console.log(TAG, 'Location watch started');
    } catch (error) {
      console.error(TAG, 'Error starting location watch:', error);
      throw error;
    }
  }

  /**
   * Stop watching location updates
   */
  async stopWatching() {
    if (this.watchSubscription) {
      console.log(TAG, 'Stopping location watch...');
      this.watchSubscription.remove();
      this.watchSubscription = null;
    }
  }

  /**
   * Reverse geocode coordinates to address
   * @param {number} latitude
   * @param {number} longitude
   * @returns {Promise<{name: string, street: string, city: string, region: string, country: string, postalCode: string}>}
   */
  async reverseGeocode(latitude, longitude) {
    console.log(TAG, 'Reverse geocoding:', latitude, longitude);

    try {
      const results = await Location.reverseGeocodeAsync({
        latitude,
        longitude,
      });

      if (results && results.length > 0) {
        const result = results[0];
        
        const address = {
          name: result.name,
          street: result.street,
          city: result.city,
          region: result.region,
          country: result.country,
          postalCode: result.postalCode,
          formattedAddress: this.formatAddress(result),
        };

        console.log(TAG, 'Geocode result:', address);
        return address;
      }

      return null;
    } catch (error) {
      console.error(TAG, 'Error reverse geocoding:', error);
      throw error;
    }
  }

  /**
   * Format address object to string
   * @param {Object} address
   * @returns {string}
   */
  formatAddress(address) {
    const parts = [];
    
    if (address.name && address.name !== address.street) {
      parts.push(address.name);
    }
    if (address.street) {
      parts.push(address.street);
    }
    if (address.city) {
      parts.push(address.city);
    }
    if (address.region) {
      parts.push(address.region);
    }
    
    return parts.join(', ') || 'Unknown location';
  }

  /**
   * Geocode address to coordinates
   * @param {string} address
   * @returns {Promise<{latitude: number, longitude: number} | null>}
   */
  async geocodeAddress(address) {
    console.log(TAG, 'Geocoding address:', address);

    try {
      const results = await Location.geocodeAsync(address);

      if (results && results.length > 0) {
        const result = results[0];
        return {
          latitude: result.latitude,
          longitude: result.longitude,
        };
      }

      return null;
    } catch (error) {
      console.error(TAG, 'Error geocoding address:', error);
      throw error;
    }
  }

  /**
   * Calculate distance between two points (in meters)
   * @param {number} lat1
   * @param {number} lon1
   * @param {number} lat2
   * @param {number} lon2
   * @returns {number}
   */
  calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Format distance for display
   * @param {number} meters
   * @returns {string}
   */
  formatDistance(meters) {
    if (meters < 1000) {
      return `${Math.round(meters)} m`;
    }
    return `${(meters / 1000).toFixed(1)} km`;
  }

  /**
   * Get region for map centered on location
   * @param {number} latitude
   * @param {number} longitude
   * @param {number} radiusKm - Radius in kilometers
   * @returns {{latitude: number, longitude: number, latitudeDelta: number, longitudeDelta: number}}
   */
  getRegion(latitude, longitude, radiusKm = 1) {
    // Approximate degrees for the given radius
    const latDelta = radiusKm / 111; // 1 degree ≈ 111 km
    const lonDelta = radiusKm / (111 * Math.cos(latitude * (Math.PI / 180)));

    return {
      latitude,
      longitude,
      latitudeDelta: latDelta * 2,
      longitudeDelta: lonDelta * 2,
    };
  }
}

// Export singleton instance
export const LocationService = new LocationServiceClass();
export default LocationService;
