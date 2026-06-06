/**
 * Journal Components Module
 * 
 * Export all journal-related components.
 */

// Entry display
export { JournalEntryCard } from './JournalEntryCard';
export { default as JournalEntryCardComponent } from './JournalEntryCard';

// Media gallery tab
export { MediaGalleryTab, MediaFilter } from './MediaGalleryTab';
export { default as MediaGalleryTabComponent } from './MediaGalleryTab';

// Floating action button
export { 
  FloatingActionButton, 
  SimpleFAB, 
  CameraFAB,
  FABAction,
} from './FloatingActionButton';
export { default as FloatingActionButtonComponent } from './FloatingActionButton';

// Compose modal
export { JournalComposeModal } from './JournalComposeModal';
export { default as JournalComposeModalComponent } from './JournalComposeModal';

// Calendar coils header
export { CalendarCoils } from './CalendarCoils';
export { default as CalendarCoilsComponent } from './CalendarCoils';

// Media explorer bottom sheet
export { MediaExplorerSheet } from './MediaExplorerSheet';
export { default as MediaExplorerSheetComponent } from './MediaExplorerSheet';

// Date swipe container
export { DateSwipeContainer } from './DateSwipeContainer';
export { default as DateSwipeContainerComponent } from './DateSwipeContainer';

// Quick capture bar
export { QuickCaptureBar } from './QuickCaptureBar';
export { default as QuickCaptureBarComponent } from './QuickCaptureBar';

// Entry gallery modal (per-entry map + media)
export { EntryGalleryModal } from './EntryGalleryModal';
export { default as EntryGalleryModalComponent } from './EntryGalleryModal';

// Full screen media viewer
export { FullScreenMediaViewer } from './FullScreenMediaViewer';
export { default as FullScreenMediaViewerComponent } from './FullScreenMediaViewer';

// Calendar picker modal
export { CalendarPickerModal } from './CalendarPickerModal';
export { default as CalendarPickerModalComponent } from './CalendarPickerModal';

// Reaction & Engagement components
export { 
  REACTIONS, 
  getReactionByKey, 
  ReactionPicker, 
  ReactionDisplay, 
  QuickReactButton 
} from './ReactionPicker';
export { default as ReactionPickerComponent } from './ReactionPicker';

export { EngagementSection } from './EngagementSection';
export { default as EngagementSectionComponent } from './EngagementSection';
