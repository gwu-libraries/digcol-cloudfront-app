window.onload = (event) => {
    const downloadTargetParamsString = window.location.search;
    const downloadTargetParams = new URLSearchParams(downloadTargetParamsString);
    try {
        const filePath = downloadTargetParams.get("file");
        if (filePath) {
            document.getElementById("message").innerHTML = document.getElementById("message").innerHTML.replace("your file", `${filePath}`);
            window.location.assign(filePath);
        }
    } catch (error) {
        console.error(error);
    }
};