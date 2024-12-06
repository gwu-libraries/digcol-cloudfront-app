// Swap the comment on the next two lines for testing
//module.exports = class NavigableTree {
class NavigableTree {
    /* Contains logic for converting an S3 inventory to a browsable tree of links. Stores the inventory as an ArrayBuffer. */

    constructor(inventoryUrl) {
        console.log("NavigableTree instance created.")
        this.inventoryRootUrl = inventoryUrl;
    }

    ROOT_NODE_DEPTH = 3;

    async loadRoot() {
        /* Method should be called once. Fetches the inventory from the URL provided to the constructor and stores it as an ArrayBuffer (to support multiple reads). Reads the ArrayBuffer as a parquet file, extracting the data in the _key_ column and initiating the creation of the browsable tree. */
        const res = await fetch(this.inventoryRootUrl);
        const data = await res.json();
        this.createTree(data);
    }

    async updateSubTree() {
        // If the updated breadcrumbs extend beyond the depth of the tree loaded as root
        if (this.breadcrumbs.length > this.ROOT_NODE_DEPTH) {
            // generate the key that points to the branch currently indicated by the breadcrumbs
            const rootKey = this.breadcrumbs.slice(1, this.ROOT_NODE_DEPTH + 1).map(b => b.key).join('__');
            // if it's not the current subtree, load it
            if (!Object.hasOwn(this, "subTree") || (this.subTree.rootKey != rootKey)) {
                try {
                const res = await fetch(`./js/testdata/json/${rootKey}.json`);
                const data = await res.json();
                this.subTree = { rootKey: rootKey, 
                                data: data };  
                }
                // If this branch is terminal, reset the subtree
                catch (e) {
                    this.subTree = {};
                }
           }
        }
        this.navigateTree()
    }

    createTree(data) {
        /* Creates a navigable tree of links based on the nested paths from the inventory. */
        console.log("Creating tree...")
        this.tree = data;
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
        // Descend the tree, using each breadcrumb as a key to the next level

        let currentNode;
        if (this.breadcrumbs.length == 1) currentNode = this.tree;
        else if (this.breadcrumbs.length <= this.ROOT_NODE_DEPTH) {
            currentNode = this.breadcrumbs.slice(1).reduce( (node, breadcrumb) => {
                return node.paths[breadcrumb.key];
            }, this.tree); 
        }
        else if (Object.keys(this.subTree).length == 0) {
            currentNode = this.breadcrumbs.slice(1, this.breadcrumbs.length).reduce( (node, breadcrumb) => {
                return node.paths[breadcrumb.key];
            }, this.tree); 
        }
        else {
            currentNode = this.breadcrumbs.slice(this.ROOT_NODE_DEPTH + 1).reduce( (node, breadcrumb) => {
                return node.paths[breadcrumb.key];
            }, this.subTree.data); 
        } 
        // remove links from previous node
        this.treeDiv.innerHTML = '';
        // if no current paths, we may need to load a new subtree
        let keys = Object.keys(currentNode.paths);
        for (const key of keys) {
                this.createNavigableLink(key);
        }
        for (const file of currentNode.files) {
                this.createStaticLink(file);
        }
        this.createBreadCrumbs();
    }
    
    createNavigableLink(key) {
        /* Creates a link to a (navigable) child node of the current node of the tree */
        const wrap = document.createElement('div');
        const navDiv = document.createElement('div');
        wrap.classList.add('link-wrapper');
        const folder = document.createElement('img');
        folder.setAttribute('src', '/img/folder-icon.svg');
        const p = document.createElement('p');
        const nav = document.createElement('a');
        nav.textContent = key;
        nav.setAttribute('href', '#')
        nav.addEventListener('click', e => this.descendTree(e));
        p.appendChild(nav);
        navDiv.appendChild(folder);
        navDiv.appendChild(p);
        wrap.appendChild(navDiv)
        this.treeDiv.append(wrap);
    }

    createStaticLink(metadata) {
        /* Creates a link to download a file (terminal child node of the current node of the tree) 
        :param metadata: an array representing a row of the inventory. The first element should be the object (file) key, the second its size in bytes, and the third, its last modified date. */
        //const [key, size, lastModified] = metadata;
        const key = metadata;
        const wrap = document.createElement('div');
        const linkDiv = document.createElement('div');
        const linkInfo = document.createElement('div');
        wrap.classList.add('file-wrapper');
        const download = document.createElement('img');
        download.setAttribute('src', '/img/download-icon.svg');
        const metadataInfo = document.createElement('p');
        const staticLink = document.createElement('a');
        // The download link contains the full path to the file object as a URL parameter
        let filePath = this.breadcrumbs.slice(1).join('/')
        staticLink.setAttribute('href', `/index.html?file=${filePath}/${key}`);
        staticLink.setAttribute('target', '_blank');
        staticLink.textContent = key;
        //metadataInfo.textContent = `Size: ${size}, Last modified: ${lastModified.toISOString()}`;
        linkDiv.appendChild(download);
        linkInfo.appendChild(staticLink);
        linkInfo.appendChild(metadataInfo);
        linkDiv.appendChild(linkInfo);
        wrap.appendChild(linkDiv);
        this.treeDiv.appendChild(wrap);
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

    descendTree(e) {
        /* Responds to a click on one of the navigable node links (children of the current node)  */
        const key = e.target.textContent;
        // Add the current node to the breadcrumbs
        this.breadcrumbs.push({key: key, index: this.breadcrumbs.length});
        this.updateSubTree();
        e.preventDefault();

    }

    ascendTree(e) {
        /* Responds to a click on one of the breadcrumb links -- going up the tree to an ancestor of the current node */
        const index = Number(e.target.dataset.index);
        const numNodes = this.breadcrumbs.length;
        if (this.breadcrumbs.length == 1) return; // Don't navigate past the root level
        // Pop nodes off the list that follow the selected node
        for (let i = index; i < numNodes - 1; i++) {
            this.breadcrumbs.pop();
        }
        this.updateSubTree();
        e.preventDefault();
    }
}

function getPathParams() {
    /* Extract optional folder= URL param (to load the tree from a specific branch) */
    const downloadTargetParamsString = window.location.search;
    const downloadTargetParams = new URLSearchParams(downloadTargetParamsString);
    return downloadTargetParams.get("folder");
}
/* Comment to the bottom of the file for testing */
// something like this to check for the document load
function onLoad(callback) {
    if (document.readyState === 'complete') { 
      console.log('Ready State complete')
      callback();
    } else {
      console.log('Adding window listener')
      window.addEventListener('load', callback);
    }
  };

onLoad(async (event) => {
    // Uses the hyparquet.js library to load a parquet file of S3 inventory.
    //The "key" column should contain the paths to the objects in the bucket. 
    const rootUrl = "./js/testdata/json/root.json"  
    //const url = "../inventory.parquet" // for local testing
    const tree = new NavigableTree(rootUrl);
    await tree.loadRoot();
});

