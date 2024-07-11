import { TreeMap } from './treemap.js'

const { parquetRead } = await import("https://cdn.jsdelivr.net/npm/hyparquet/src/hyparquet.min.js")


class NavigableTree {
    /* Contains logic for converting an S3 inventory to a browsable tree of links. Stores the inventory as an ArrayBuffer. */

    constructor(inventoryUrl) {
        this.inventoryUrl = inventoryUrl;
    }

    async loadInventory() {
        /* Method should be called once. Fetches the inventory from the URL provided to the constructor and stores it as an ArrayBuffer (to support multiple reads). Reads the ArrayBuffer as a parquet file, extracting the data in the _key_ column and initiating the creation of the browsable tree. */
        const res = await fetch(this.inventoryUrl);
        this.arrayBuffer = await res.arrayBuffer();
        await parquetRead({
            file: this.arrayBuffer,
            columns: ['key'],
            onComplete: data => this.createTree(data)
        });
    }

    createTree(data) {
        /* Creates a navigable tree of links based on the paths from the inventory. */
        // Convert the inventory data (array of arrays) into a nested map structure (tree)
        this.treeMap = createMap(data);
        // Breadcrumbs begin with the root level
        this.breadcrumbs = [{key: '/', index: 0}];
        // Get a path passed in as a URL parameter when loading the page
        let key = getPathParams();
        if (key) {
            // if a folder path was provided via URL param, add that to the breadcrumbs and navigate to that node
            key.split('/').forEach( (keyPart, i) => {
                if (keyPart) this.breadcrumbs.push({key: keyPart, index: i + 1});
            });
        }
        // references to the containers for the navigable nodes and the breadcrumbs
        this.treeDiv = document.getElementById('tree');
        this.breadcrumbsContainer = document.getElementById('breadcrumbs');
        this.navigateTree();
    
    } 
    
    navigateTree() {
        /* Create links for navigating the children of the current node of the tree. */
        // Assemble breadcrumbs into a key for the current node of the tree
        let currentLevel = this.treeMap.get(this.breadcrumbs.map(breadcrumb => breadcrumb.key));
        // remove links from previous node
        this.treeDiv.innerHTML = '';
        // Iterate over the children of the current node; if they are terminal, treat them differently
        const staticLinks = [];
        for (const [key, value] of currentLevel.entries()) {
            if (value instanceof Map) {
                this.createNavigableLink(key);
            }
            else {
                staticLinks.push(value);
            }
        }
        // For terminal entries, which correspond to files (S3 objects), retrieve additional metadata from the inventory (stored in the ArrayBuffer)
        if (staticLinks.length > 0) {
            // sort the row indices to find min and max
            const rowRange = staticLinks.map(link => link.row).toSorted( (a,b) => a - b);
            const options = {columns: ['key', 'size', 'last_modified_date'],
                            rowStart: rowRange[0],  // first row to retrieve (inclusive)
                            rowEnd: rowRange[rowRange.length - 1] + 1, // last row to retrieve (exclusive)
                            file: this.arrayBuffer,
                            onComplete: data => {
                                // pass the metadata about each file object to the method that creates static links
                                for (const row of data) {
                                    this.createStaticLink(row);
                                }
                            }
                        };
            parquetRead(options);
        }
        
        this.createBreadCrumbs();
    }
    
    createBreadCrumbs() {
        /* Generate breadcrumb links for the ancestors of the present node */
        this.breadcrumbsContainer.innerHTML = '';

        for (const breadcrumb of this.breadcrumbs) {
            let link;
            if (breadcrumb.key != '/') {
                link = document.createElement('a');
                link.setAttribute('href', '#');
                link.textContent = breadcrumb.key;
            } else {
                link = document.createElement('img');
                link.setAttribute('src', '/img/home-icon.svg');
            }
            // We store the index of the breadcrumb on the link element, so that we can retrieve it in the event listener
            link.setAttribute('data-index', breadcrumb.index);
            // Need to use arrow syntax so that the event listener function has a reference to the class method
            link.addEventListener('click', e => this.ascendTree(e));
            this.breadcrumbsContainer.appendChild(link);
            // add breadcrumb separator
            const separator = document.createElement('span');
            separator.textContent = ' / ';
            this.breadcrumbsContainer.append(separator);
        } 
    }
    
    createNavigableLink(key) {
        /* Creates a link to a (navigable) child node of the current node of the tree */
        const p = document.createElement('p');
        const link = document.createElement('a');
        link.textContent = key;
        link.setAttribute('href', '#')
        link.addEventListener('click', e => this.descendTree(e));
        p.appendChild(link);
        this.treeDiv.append(p);
    }
    
    createStaticLink(metadata) {
        /* Creates a link to download a file (terminal child node of the current node of the tree) 
        :param metadata: an array representing a row of the inventory. The first element should be the object (file) key, the second its size in bytes, and the third, its last modified date. */
        const [key, size, lastModified] = metadata;
        const div = document.createElement('div');
        const metadataInfo = document.createElement('p');
        const staticLink = document.createElement('a');
        // The download link contains the full path to the file object as a URL parameter
        // We don't show the full path as the link text; we re-create it from the breadcrumbs 
        staticLink.setAttribute('href', `/index.html?file=${key}`);
        staticLink.setAttribute('target', '_blank');
        const keyParts = key.split('/');
        staticLink.textContent = keyParts[keyParts.length - 1];
        metadataInfo.textContent = `Size: ${size}, Last modified: ${lastModified.toISOString()}`;
        div.appendChild(staticLink);
        div.appendChild(metadataInfo)
        this.treeDiv.appendChild(div);
    }
    
    ascendTree(e) {
        /* Responds to a click on one of the breadcrumb links -- going up the tree to an ancestor of the current node */
        const index = e.target.dataset.index;
        if (this.breadcrumbs.length == 1) return; // Don't navigate past the root level
        // Pop nodes off the list that follow the selected node
        for (let i = index; i < this.breadcrumbs.length; i++) {
            this.breadcrumbs.pop();
        }
        this.navigateTree();
        e.preventDefault();
    }
    
    descendTree(e) {
        /* Responds to a click on one of the navigable node links (children of the current node)  */
        const key = e.target.textContent;
        // Add the current node to the breadcrumbs
        this.breadcrumbs.push({key: key, index: this.breadcrumbs.length});
        this.navigateTree();
        e.preventDefault();
    }

}

function getPathParams() {
    /* Extract optional folder= URL param (to load the tree from a specific branch) */
    const downloadTargetParamsString = window.location.search;
    const downloadTargetParams = new URLSearchParams(downloadTargetParamsString);
    return downloadTargetParams.get("folder");
}


function createMap(parquetData) {
    /* Converts an array of arrays into a nested Map. 
    The inner arrays are assumed to contain a single string, a slash-delimmited path.
    Each element in the path becomes a key in the nested Map at a new level. */
    return parquetData.reduce( (pathMap, path, rowIndex) => {
        const pathArray = path[0].split('/'),
            // Not all objects are terminal in the bucket
            // Non-terminal objects are directory placeholders -- we can ignore those?
            file = (!pathArray[pathArray.length - 1].endsWith('/')) ? pathArray.pop() : null;
            // Add the root path to the map 
        pathArray.unshift('/')
        pathMap.set(pathArray, {file: file, row: rowIndex});
        return pathMap;
    }, new TreeMap());

}

window.onload = async (event) => {
    /* Uses the hyparquet.js library to load a parquet file of S3 inventory.
    The "key" column should contain the paths to the objects in the bucket. */
    //const url = "/scrc-digcol1/scrc-digcol1-inventory/inventory.parquet"  
    const url = "../inventory.parquet" // for local testing
    const tree = new NavigableTree(url);
    await tree.loadInventory();
};

