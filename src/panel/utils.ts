interface ObjectWithId {
    id: string | number;
    [key: string]: any;
  }
  
  interface DataStructure {
    [key: string]: ObjectWithId[];
  }
  
  interface FindResult {
    key: string;
    object: ObjectWithId;
    index: number;
  }
  
  export function findKeyById(data: DataStructure, targetId: string | number): string | null {
    for (const key in data) {
      if (Array.isArray(data[key])) {
        const found = data[key].find(item => item.id === targetId);
        if (found) {
          return key; 
        }
      }
    }
    return null; 
};