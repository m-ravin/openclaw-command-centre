// Global app state — workspace selector, privacy mode, theme.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  workspace:        string;
  privacyBlurNames: boolean;
  privacyBlurNums:  boolean;
  demoMode:         boolean;
  sidebarCollapsed: boolean;
  setWorkspace:     (id: string) => void;
  toggleBlurNames:  () => void;
  toggleBlurNums:   () => void;
  toggleDemoMode:   () => void;
  toggleSidebar:    () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      workspace:        'default',
      privacyBlurNames: false,
      privacyBlurNums:  false,
      demoMode:         false,
      sidebarCollapsed: false,
      setWorkspace:     (id) => set({ workspace: id }),
      toggleBlurNames:  () => set(s => ({ privacyBlurNames: !s.privacyBlurNames })),
      toggleBlurNums:   () => set(s => ({ privacyBlurNums:  !s.privacyBlurNums  })),
      toggleDemoMode:   () => set(s => ({ demoMode:         !s.demoMode         })),
      toggleSidebar:    () => set(s => ({ sidebarCollapsed: !s.sidebarCollapsed  })),
    }),
    { name: 'openclaw-app-state' }
  )
);
