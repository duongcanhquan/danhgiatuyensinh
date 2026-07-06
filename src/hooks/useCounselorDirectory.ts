import { useCounselorDirectoryState } from '../contexts/CounselorDirectoryContext'

/** Danh bạ `users` — một listener chung qua CounselorDirectoryProvider. */
export function useCounselorDirectory() {
  return useCounselorDirectoryState()
}
