// Swap the comment on the next two lines for testing
//module.exports = class NavigableTree {
class NavigableTree {
    /* Contains logic for converting an S3 inventory to a browsable tree of links. Stores the inventory as an ArrayBuffer. */

    constructor(inventoryUrl) {
        this.inventoryRootUrl = `${this.JSON_PATH}/${inventoryUrl}`;
    }

    ROOT_NODE_DEPTH = 3;

    //JSON_PATH = '/js/testdata/json'
    JSON_PATH = '/scrc-digcol1/scrc-digcol1-inventory/json'

    async loadRoot() {
        /* Method should be called once. Fetches the inventory from the URL provided to the constructor and stores it as an ArrayBuffer (to support multiple reads). Reads the ArrayBuffer as a parquet file, extracting the data in the _key_ column and initiating the creation of the browsable tree. */
        const res = await fetch(this.inventoryRootUrl);
        const data = await res.json();
        await this.createTree(data);
    }

    async updateSubTree() {
        // If the updated breadcrumbs extend beyond the depth of the tree loaded as root
        if (this.breadcrumbs.length > this.ROOT_NODE_DEPTH) {
            // generate the key that points to the branch currently indicated by the breadcrumbs
            const rootKey = this.breadcrumbs.slice(1, this.ROOT_NODE_DEPTH + 1).map(b => b.key).join('__');
            // if it's not the current subtree, load it
            if (!Object.hasOwn(this, "subTree") || (this.subTree.rootKey != rootKey)) {
                try {
                const res = await fetch(`${this.JSON_PATH}/${rootKey}.json`);
                if (!res.ok) throw new Error('Terminal branch', {cause: 'terminal'});
                const data = await res.json();
                this.subTree = { rootKey: rootKey, 
                                data: data };  
                }
                // If this branch is terminal, reset the subtree
                catch (e) {
                    if (e.cause == 'terminal') {
                        this.subTree = {};
                    }
                    else {
                        console.error(e);
                    }
                }
           }
        }
        this.navigateTree()
    }

    async createTree(data) {
        /* Creates a navigable tree of links based on the nested paths from the inventory. */
        this.tree = data;
        // Breadcrumbs begin with the root level
        this.breadcrumbs = [{key: '/', index: 0}];
        // references to the containers for the navigable nodes and the breadcrumbs
        this.treeDiv = document.getElementById('tree');
        this.breadcrumbsContainer = document.getElementById('breadcrumbs');
        // For handing forward/back buttons
        this.createHistoryListener();
        // Get a path passed in as a URL parameter when loading the page
        let key = getPathParams();
        if (key) {
            // if a folder path was provided via URL param, add that to the breadcrumbs and navigate to that node
            key.split('/').forEach( (keyPart, i) => {
                if (keyPart) this.breadcrumbs.push({key: keyPart, index: i + 1});
            });
            // Set history 
            history.replaceState(this.breadcrumbs, "",`inventory.html?folder=${this.breadcrumbs.slice(1).map(b => b.key).join('/')}`);
            await this.updateSubTree();
        }
        else {
            history.replaceState(this.breadcrumbs, "",`inventory.html?folder=`);
            this.navigateTree();
        }
    }

    createHistoryListener() {
        window.addEventListener('popstate', (e) => {
            if (e.state) {
                this.breadcrumbs = e.state;
                this.updateSubTree();
            }
        })
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

    copyToClipboard(e) {
        e.preventDefault();
        const key = e.target.dataset.key;
        const text = this.breadcrumbs.slice(1).map(b => b.key).join('/') + `/${key}`;
        let url;
        switch (e.target.dataset.type) {
            case 'folder':
                url = `inventory.html?folder=${text}`;
                break;
            case 'file':
                url = `index.html?file=${text}`;
                break;
        }
        // Update clicked icon to checked state; reset any others to clipboard state
        document.querySelectorAll('.clipboard-icon').forEach(icon => {
            if (icon.dataset.key == key) {
                icon.setAttribute('src', '/img/clipboard-check.svg');
            }
            else {
                icon.setAttribute('src', 'img/clipboard-copy.svg');
            }
        })
        return navigator.clipboard.writeText(`${window.location.host}/${url}`)
                .then(() => true)
                .catch(() => false);
    }

    createCopyToClipBoardButton(key, linkType) {
        const clipboardIcon = document.createElement('img');
        clipboardIcon.setAttribute('src', '/img/clipboard-copy.svg');
        clipboardIcon.setAttribute('data-key', key);
        clipboardIcon.setAttribute('data-type', linkType);
        clipboardIcon.classList.add('clipboard-icon');
        clipboardIcon.addEventListener('click', e => this.copyToClipboard(e));
        let clipboard = document.createElement('div');
        clipboard.classList.add('clipboard-icon-container');
        clipboard.appendChild(clipboardIcon);
        return clipboardIcon;
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
        navDiv.appendChild(this.createCopyToClipBoardButton(key, 'folder'));
        wrap.appendChild(navDiv)
        this.treeDiv.append(wrap);
    }

    createStaticLink(metadata) {
        /* Creates a link to download a file (terminal child node of the current node of the tree) 
        :param metadata: an array representing a row of the inventory. The first element should be the object (file) key, the second its size in bytes, and the third, its last modified date. */
        const {"filename": filename, "size": size, "last-modified": lastModified} = metadata;
        const wrap = document.createElement('div');
        const linkDiv = document.createElement('div');
        const linkInfo = document.createElement('div');
        wrap.classList.add('file-wrapper');
        const download = document.createElement('img');
        download.setAttribute('src', '/img/download-icon.svg');
        const metadataInfo = document.createElement('p');
        const staticLink = document.createElement('a');
        // The download link contains the full path to the file object as a URL parameter
        let filePath = this.breadcrumbs.slice(1).map(b => b.key).join('/');
        staticLink.setAttribute('href', `/index.html?file=${filePath}/${filename}`);
        staticLink.setAttribute('target', '_blank');
        staticLink.textContent = filename;
        metadataInfo.textContent = `Size: ${formatBytes(size)}, Last modified: ${new Date(lastModified).toDateString()}`;
        linkInfo.appendChild(download);
        linkInfo.appendChild(staticLink);
        linkInfo.appendChild(this.createCopyToClipBoardButton(filename, 'file'));
        linkDiv.appendChild(linkInfo);
        linkDiv.appendChild(metadataInfo);
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
        e.preventDefault();
        /* Responds to a click on one of the navigable node links (children of the current node)  */
        const key = e.target.textContent;
        // Add the current node to the breadcrumbs
        this.breadcrumbs.push({key: key, index: this.breadcrumbs.length});
        // Add current state to history
        history.pushState(this.breadcrumbs, "", `inventory.html?folder=${this.breadcrumbs.slice(1).map(b => b.key).join('/')}`)
        this.updateSubTree();

    }

    ascendTree(e) {
        e.preventDefault();
        /* Responds to a click on one of the breadcrumb links -- going up the tree to an ancestor of the current node */
        const index = Number(e.target.dataset.index);
        const numNodes = this.breadcrumbs.length;
        if (this.breadcrumbs.length == 1) return; // Don't navigate past the root level
        // Pop nodes off the list that follow the selected node
        for (let i = index; i < numNodes - 1; i++) {
            this.breadcrumbs.pop();
        }
        // Add current state to history
        history.pushState(this.breadcrumbs, "", `inventory.html?folder=${this.breadcrumbs.slice(1).map(b => b.key).join('/')}`)
        this.updateSubTree();
    }


}

class RecentStats {
    /* Contains logic for converting an S3 inventory to a browsable tree of links. Stores the inventory as an ArrayBuffer. */

    STATS_PATH = '/scrc-digcol1/scrc-digcol1-inventory/json/__weekly-update.json';
    //STATS_PATH = '/js/testdata/json/__weekly-update.json';

    constructor() {
        
    }

    async loadStats() {
        const res = await fetch(this.STATS_PATH);
        const data = await res.json();
        await this.createStats(data);
        await this.createDownloadTable(data);
    }

    async createStats(data) {
        let statsTableRow = document.getElementById('recent-stats-table-body-row');
        // Add the totals in each category to the table
        for (let key of ['additions', 'changes', 'deletes']) {
            let total = data[key].length;
            let cell = document.createElement('td');
            cell.textContent = total;
            statsTableRow.appendChild(cell);
        }
        // Update the caption
        // Updates are from the previous week
        let caption = document.getElementById('recent-stats-table-caption');
        let sunday = getSunday(new Date());
        sunday.setDate(sunday.getDate() - 7);
        caption.textContent = `Inventory changes since ${sunday.toLocaleDateString()}`;
    }

    async createDownloadTable(data) {
        // Create the downloadable CSV file
        let headers = ['Bucket', 'Key', 'Size', 'LastModifiedDate'];
        let typeMap = {changes: 'Modified', additions: 'Added', deletes: 'Deleted'};
        let csv = 'data:text/csv;charset=utf-8,';
        csv += ('Type,' + headers.join(',') + '\r\n');
        Object.keys(data).forEach(key => {
            // each object is a row in the CSV
            data[key].forEach(obj => {
                // each row starts with the type of update
                csv += `${typeMap[key]},`;
                for (let header of headers) {
                    // lastModifiedDate is the last header, so we include the line terminal characters
                    if (header == 'LastModifiedDate') {
                        csv += `${new Date(obj[header]).toLocaleDateString()}\r\n`;
                    } else if (header == 'Size') {
                        csv += `${formatBytes(obj[header])},`;
                    }
                    else {
                        csv += `${obj[header]},`;
                    }
                }
            })
        });
        // Create a download link
        let encodedCsv = encodeURI(csv);
        let downloadLink = document.createElement('a');
        downloadLink.setAttribute('target', '_blank');
        downloadLink.setAttribute('href', encodedCsv);
        downloadLink.setAttribute('download', 'recent-objects.csv');
        downloadLink.textContent = 'Download CSV of recent objects'
        document.getElementById('recent-stats').append(downloadLink);
    }

}

function formatBytes(bytes, decimals) {
    if(bytes == 0) return '0 Bytes';
    var k = 1024,
        dm = decimals || 2,
        sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'],
        i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
 }

function getSunday(date) {
    // Get the date of Sunday of the current week
    let d = new Date();
    let sunday = d.getDate() - d.getDay();
    return new Date(d.setDate(sunday));
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
      callback();
    } else {
      window.addEventListener('load', callback);
    }
  };

onLoad(async (event) => {
    // Uses the hyparquet.js library to load a parquet file of S3 inventory.
    //The "key" column should contain the paths to the objects in the bucket. 
    const tree = new NavigableTree('root.json');
    await tree.loadRoot();
    const stats = new RecentStats();
    await stats.loadStats();
});

