import { useEffect, useMemo, useState } from 'react'
import { doc, onSnapshot, setDoc, Timestamp } from 'firebase/firestore'
import { getFirestoreDb } from '../services/firebase'
import {
  KNOWLEDGE_BUILTIN_CATEGORIES,
  mergeKnowledgeCategories,
  normalizeKnowledgeCategoryId,
  type KnowledgeCategoryDef,
} from '../utils/knowledgeCategories'

const DOC_PATH = { collection: 'scoringAux', id: 'knowledgeCategories' } as const

export function useKnowledgeCategories() {
  const [custom, setCustom] = useState<KnowledgeCategoryDef[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const db = getFirestoreDb()
    if (!db) {
      queueMicrotask(() => {
        setCustom([])
        setLoading(false)
      })
      return
    }
    const ref = doc(db, DOC_PATH.collection, DOC_PATH.id)
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const data = snap.data()
        const raw = Array.isArray(data?.categories) ? data.categories : []
        const next: KnowledgeCategoryDef[] = []
        for (const item of raw) {
          if (!item || typeof item !== 'object') continue
          const o = item as Record<string, unknown>
          const id = normalizeKnowledgeCategoryId(String(o.id ?? ''))
          const label = String(o.label ?? '').trim()
          if (id && label) next.push({ id, label })
        }
        setCustom(next)
        setLoading(false)
      },
      () => {
        setCustom([])
        setLoading(false)
      },
    )
    return () => unsub()
  }, [])

  const categories = useMemo(() => mergeKnowledgeCategories(custom), [custom])

  const addCategory = async (label: string) => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa cấu hình Firebase')
    const clean = label.trim()
    if (!clean) throw new Error('Nhập tên danh mục')
    const id = normalizeKnowledgeCategoryId(clean)
    if (!id) throw new Error('Tên danh mục không hợp lệ')
    if (categories.some((c) => c.id === id)) throw new Error('Danh mục đã tồn tại')
    const nextCustom = [...custom, { id, label: clean }]
    await setDoc(
      doc(db, DOC_PATH.collection, DOC_PATH.id),
      { categories: nextCustom, updatedAt: Timestamp.now() },
      { merge: true },
    )
  }

  const updateCategory = async (id: string, label: string) => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa cấu hình Firebase')
    const norm = normalizeKnowledgeCategoryId(id)
    const clean = label.trim()
    if (!norm) throw new Error('Mã danh mục không hợp lệ')
    if (!clean) throw new Error('Nhập tên danh mục')

    const isBuiltin = KNOWLEDGE_BUILTIN_CATEGORIES.some((c) => c.id === norm)
    const inCustom = custom.some((c) => c.id === norm)

    if (!isBuiltin && !inCustom) throw new Error('Không tìm thấy danh mục')

    let nextCustom: KnowledgeCategoryDef[]
    if (inCustom) {
      nextCustom = custom.map((c) => (c.id === norm ? { ...c, label: clean } : c))
    } else {
      nextCustom = [...custom, { id: norm, label: clean }]
    }

    await setDoc(
      doc(db, DOC_PATH.collection, DOC_PATH.id),
      { categories: nextCustom, updatedAt: Timestamp.now() },
      { merge: true },
    )
  }

  const removeCategory = async (id: string) => {
    const db = getFirestoreDb()
    if (!db) throw new Error('Chưa cấu hình Firebase')
    const norm = normalizeKnowledgeCategoryId(id)
    const inCustom = custom.some((c) => c.id === norm)
    if (!inCustom) {
      if (KNOWLEDGE_BUILTIN_CATEGORIES.some((c) => c.id === norm)) {
        throw new Error('Không xóa được danh mục mặc định — chỉ xóa được danh mục bạn tự thêm.')
      }
      throw new Error('Không tìm thấy danh mục')
    }
    const nextCustom = custom.filter((c) => c.id !== norm)
    await setDoc(
      doc(db, DOC_PATH.collection, DOC_PATH.id),
      { categories: nextCustom, updatedAt: Timestamp.now() },
      { merge: true },
    )
  }

  return { categories, custom, loading, addCategory, updateCategory, removeCategory }
}
