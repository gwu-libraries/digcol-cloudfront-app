/**
 * @jest-environment jsdom
 */
const { readFileSync } = require('node:fs');
const { glob } = require('glob');
const { afterEach } = require('node:test');

function loadMockData() {
    const data = {};
    for (const entry of glob.sync('./custom-assets/js/testdata/json/*.json')) {
        const key = entry.split('/').at(-1);
        data[key] = JSON.parse(readFileSync(entry));
    }
    return data
}

function loadTestCases(k=0) {
    const file = './custom-assets/js/testdata/flat-keys.json';
    const data = JSON.parse(readFileSync(file));
    return getRandomSamples(data, k);
}

async function updateSubTreeMock() {
    // If the updated breadcrumbs extend beyond the depth of the tree loaded as root
    if (this.breadcrumbs.length > this.ROOT_NODE_DEPTH) {
        // generate the key that points to the branch currently indicated by the breadcrumbs
        const rootKey = this.breadcrumbs.slice(1, this.ROOT_NODE_DEPTH + 1).map(b => b.key).join('__');
        // if it's not the current subtree, load it
        if (!Object.hasOwn(this, "subTree") || (this.subTree.rootKey != rootKey)) {
            try {
            //const res = await fetch(`./json/${rootKey}.json`);
            //const data = await res.json();
            const data = this.mockTreeData[`${rootKey}.json`];
            if (!data) throw new Error('File not found');
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

function getRandomInt(max) {
    return Math.floor(Math.random() * max);
}

function getRandomSamples(collection, k) {
    // without replacement
    const indices = [];
    for (let i = 0; i < k; i++) {
        let n = getRandomInt(collection.length - 1);
        while (indices.indexOf(n) > -1) {
            n = getRandomInt(collection.length - 1);
        }
        indices.push(n);
    }
    return collection.filter((_, i) => indices.indexOf(i) > -1);

}

require('jest-fetch-mock').enableMocks();

let testCases = loadTestCases(50000);

describe('navigate tree', () => {
    let $;
    let NavigableTree;
    let treeData;
    let tree;
    let errors = [];
    let counter = 0;
    
    beforeAll(async () => {
        $ = require('jquery');
        NavigableTree = require("./load_tree.js");
    
    
        
        treeData = await loadMockData();

    
        document.body.innerHTML = `
        <div class="breadcrumbs-container">
            <div id="breadcrumbs">
    
            </div>
        </div>
        <div class="tree-container">
            <div id="tree">
    
            </div>
        </div>
        `;
        
        fetch.mockResponseOnce(JSON.stringify(treeData['root.json']));
        let rootUrl = ".testdata/json/root.json"  
        tree = new NavigableTree(rootUrl);
        tree.mockTreeData = treeData;
        let spy = jest.spyOn(tree, 'updateSubTree').mockImplementation(updateSubTreeMock);
        await tree.loadRoot();

        console.log(`Running ${testCases.length} random tests...`)
    });
    beforeEach(() => $('#breadcrumbs img')[0].click());


    afterAll(() => console.log(errors));

    //let oneTestCase = 'digcol2-contents/rg0044/preservation/rg0044_s42/gwu_federalist_v9_n1/gwu_federalist_v9_n1_00001.tif';
    test.each(testCases)('test S3 key', async (key) => {
    //test.each([oneTestCase])('test S3 key', async (key) => {

        if (key.endsWith('/')) {
            return
        }
        const keyParts = key.split('/');
        for (const keyPart of keyParts) {
            let a = $(`#tree a:contains(${keyPart})`).filter(function () { return $(this).text() === keyPart })
            try {
                expect($(a[0]).text()).toBe(keyPart);
             } catch (err) {
                errors.push(key);
                throw err;
            }
            a[0].click();
        }
           
    })
}); 