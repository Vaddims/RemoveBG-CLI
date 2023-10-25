# RemoveBG CLI

## **Introduction**

The RemoveBG CLI is a command-line utility that was developed to automate the process of removing backgrounds from images utilizing the Remove.bg service. This CLI is a self-contained TypeScript application that provides a user-friendly interface for interacting with the Remove.bg API, processing images in bulk, and managing API keys.

**Note:** Since the development of this CLI, an official CLI has been released by Remove.bg. It is highly recommended to use the official CLI for better support and integration with the Remove.bg service. This project was initiated before the existence of the official CLI and serves as an alternative for those who prefer a custom solution.

The source code for this CLI can be found on [GitHub](https://github.com/Vaddims/RemoveBG-CLI).

## **Prerequisites**

Ensure that you have the following installed on your machine:

- Node.js (v14 or later)
- TypeScript (v4.2.4 or later)

## **Installation**

Clone the repository from GitHub and install the dependencies using npm:

```bash
git clone https://github.com/Vaddims/removebg-cli.git
cd removebg-cli
npm install
```

## **Configuration**

Before using the CLI, you need to configure it by editing the **`config.json`** file. Here is what each configuration option does:

- **`apiKeys`**: An array of API keys for the Remove.bg service.
- **`inputDir`**: The full path to the directory containing the images to be processed.
- **`outputDir`**: The full path to the directory where the processed images will be saved.
- **`background`**: (Optional) The full path to an image to be used as a new background.
- **`outputImageFormat`**: The format of the output images (**`png`**, **`jpg`**, or **`jpeg`**).
- **`skipDialogs`**: Whether to skip confirmation dialogs during the image processing.

```json
{
  "apiKeys": ["your-api-key-here"],
  "inputDir": "./input",
  "outputDir": "./output",
  "background": null,
  "outputImageFormat": "png",
  "skipDialogs": false
}
```

## **Usage**

To start the CLI, run the following command in the project directory:

```bash
npm start
```

You will be presented with a prompt where you can choose the action you want to perform:

- **`accinfo`**: Display account information.
- **`process`**: Start the image processing.
- **`exit`**: Exit the CLI.

## **Error Handling**

The CLI has basic error handling to deal with common issues such as invalid API keys, rate limiting, and network errors. It provides feedback to the user and offers options to retry or exit the process.

## **License**

This project is licensed under the MIT License.

## **Contact**

For any inquiries, you can contact the author via email at [vadym.iefremov@gmail.com](mailto:vadym.iefremov@gmail.com).

## **Acknowledgements**

This CLI was inspired by the need for a bulk image processing solution before the official Remove.bg CLI was available. The official CLI is now recommended for all users.