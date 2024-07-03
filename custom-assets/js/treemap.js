export class TreeMap {
    constructor(args) {
        this.treeMap = new Map(args);
    }

    set(keys, terminalValue = nil) {
        /* Creates a nested series of Maps from an array or iterator of keys, assumed to be in sequential order.
         If provided, the terminal value will be added to the final map, using an incremental key. This permits multiple terminal values to be add to the innermost Map, in essence as if it were an array. */
         let treeMapRef = this.treeMap;
         for (const key of keys) {
            // if we haven't seen this key, create a new level in the tree
            if (!treeMapRef.has(key)) {
                treeMapRef.set(key, new Map());
            }
            treeMapRef = treeMapRef.get(key);
        }
        if (terminalValue) {
            let index = treeMapRef.size;
            treeMapRef.set(index, terminalValue);
        }
    }
    get(keys) {
        /* Given an array or iterator of keys, returns the nested value associated with the last key, which may be a Map or another type, if the last key points to the innermost Map. */
        let treeMapRef = this.treeMap;
        for (const key of keys) {
            treeMapRef = treeMapRef.get(key);
        }
        return treeMapRef;
    }

    keys() {
        /* Delegate to the iterator defined on the internal Map object (first-level). */
        return this.treeMap.keys();
    }
}