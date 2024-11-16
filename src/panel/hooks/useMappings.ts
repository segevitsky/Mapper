// src/panel/hooks/useMappings.ts
import { useState, useEffect } from 'react'

interface Mapping {
 id: string
 elementSelector: string
 apiEndpoint: string
 method: string
}

export const useMappings = () => {
 const [mappings, setMappings] = useState<Mapping[]>([])

 const addMapping = (mapping: Omit<Mapping, 'id'>) => {
   const newMapping = {
     ...mapping,
     id: Date.now().toString()
   }
   setMappings(prev => [...prev, newMapping])
   // שמירה ב-chrome storage
   chrome.storage.local.set({ mappings: [...mappings, newMapping] })
 }

 const removeMapping = (id: string) => {
   setMappings(prev => prev.filter(m => m.id !== id))
   // עדכון ב-chrome storage
   chrome.storage.local.set({ mappings: mappings.filter(m => m.id !== id) })
 }

 useEffect(() => {
   // טעינת מיפויים קיימים בעת אתחול
   chrome.storage.local.get(['mappings'], (result) => {
     if (result.mappings) {
       setMappings(result.mappings)
     }
   })
 }, [])

 return { mappings, addMapping, removeMapping }
}