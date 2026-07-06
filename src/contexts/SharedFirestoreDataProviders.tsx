import type { ReactNode } from 'react'
import { CounselorDirectoryProvider } from './CounselorDirectoryContext'
import { MasterDataProvider } from './MasterDataContext'
import { ScoringProfilesProvider } from './ScoringProfilesContext'

/** Một listener chung cho master data, danh bạ users và scoring profiles. */
export function SharedFirestoreDataProviders({ children }: { children: ReactNode }) {
  return (
    <MasterDataProvider>
      <CounselorDirectoryProvider>
        <ScoringProfilesProvider>{children}</ScoringProfilesProvider>
      </CounselorDirectoryProvider>
    </MasterDataProvider>
  )
}
