import { TreeMap } from './treemap.js'

window.onload = async (event) => {
    /* Uses the hyparquet.js library to load a parquet file of S3 inventory.
    The "key" column should contain the paths to the objects in the bucket. */
    const { parquetRead } = await import("./hyparquet/src/hyparquet.js")
    const url = "/scrc-digcol1/scrc-digcol1-inventory/inventory.parquet"  // Need to substitute with static URL
    //const url = "../inventory.parquet" 
    const res = await fetch(url)
    const arrayBuffer = await res.arrayBuffer()
    await parquetRead({
        file: arrayBuffer,
        columns: ['key'],
        onComplete: data => createTree(data)
    });
};

function createTree(data) {
    /* Creates a navigable tree of links based on the paths from the inventory. */
    const treeMap = createMap(data);
    let breadcrumbs = [{key: '/', index: 0}];
    const treeDiv = document.getElementById('tree');
    for (const key of treeMap.get(['/']).keys()) {
        createNavigableLink(key);
    }
    
    function createBreadCrumbs() {
        const breadcrumbsContainer = document.getElementById('breadcrumbs');
        breadcrumbsContainer.innerHTML = '';
        for (const breadcrumb of breadcrumbs) {
            let link;
            if (breadcrumb.key != '/') {
                link = document.createElement('a');
                link.setAttribute('href', '#');
                link.textContent = breadcrumb.key;
            } else {
                link = document.createElement('img');
                link.setAttribute('src', '/img/home-icon.svg');
            }
            link.setAttribute('data-index', breadcrumb.index);
            link.addEventListener('click', ascendTree);
            breadcrumbsContainer.appendChild(link);
            const separator = document.createElement('span');
            separator.textContent = ' / ';
            breadcrumbsContainer.append(separator);
        } 
    }

    function createNavigableLink(key) {
        const p = document.createElement('p');
        const link = document.createElement('a');
        link.textContent = key;
        link.setAttribute('href', '#')
        link.addEventListener('click', descendTree);
        p.appendChild(link);
        treeDiv.append(p);
    }

    function createStaticLink(key) {
        const treeDiv = document.getElementById('tree');
        const p = document.createElement('p');
        const staticLink = document.createElement('a');
        staticLink.setAttribute('href', '/index.html?file=' + breadcrumbs.slice(1).map(b => b.key).join('/') + `/${key}`);
        staticLink.setAttribute('target', '_blank');
        staticLink.textContent = key;
        p.appendChild(staticLink);
        treeDiv.appendChild(p);
    }

    function ascendTree(e) {
        const index = e.target.dataset.index;
        console.log(e.target.dataset)
        for (let i = index; i < breadcrumbs.length; i++) {
            breadcrumbs.pop();
        }
        navigateTree();
        e.preventDefault();
    }
    
    function descendTree(e) {
        const key = e.target.textContent;
        breadcrumbs.push({key: key, index: breadcrumbs.length});
        navigateTree();
        e.preventDefault();
    }

    function navigateTree() {
        let currentLevel = treeMap.get(breadcrumbs.map(breadcrumb => breadcrumb.key));
        document.getElementById('tree').innerHTML = '';
        for (const [key, value] of currentLevel.entries()) {
            if (value instanceof Map) {
                createNavigableLink(key);
            }
            else {
                createStaticLink(value);
            }
        }
        createBreadCrumbs();
    }

}

function createMap(parquetData) {
    /* Converts an array of arrays into a nested Map. 
    The inner arrays are assumed to contain a single string, a slash-delimmited path.
    Each element in the path becomes a key in the nested Map at a new level. */
    return parquetData.reduce( (pathMap, path) => {
        const pathArray = path[0].split('/'),
            // Not all objects are terminal in the bucket
            // Non-terminal objects are directory placeholders -- we can ignore those?
            file = (!pathArray[pathArray.length - 1].endsWith('/')) ? pathArray.pop() : null;
            // Add the root path to the map 
        pathArray.unshift('/')
        pathMap.set(pathArray, file);
        return pathMap;
    }, new TreeMap());

}