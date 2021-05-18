import proccess from 'process';
import readline from 'readline';
import fetch from 'node-fetch';
import FormData from 'form-data';
import path from 'path';
import fs from 'fs';

/** Place here all your needed data to skip
 * common questions for the image proccess on each app boot */
const IMAGE_PROCCESS_DATA = {
	/** All `api keys` (You can add multiple API keys.
	 * In case one of them has a problem,
	 * the application will switch to the
	 * next one and notify you.) */
	API_KEYS: [],
	/** The `directory` on your system from
	 * which you want the image process to
	 * capture the images that need to be edited. */
	INPUT_DIR: '',
	/** The path to the `background` of your images (If needed) */
	INPUT_BACKGROUND: '',
	/** The `directory` on your system in
	 * which you want to save all the edited images */
	OUTPUT_DIR: '',
	/** The image `format` that the output images will have
	 * (For transparency use only `png` extension)
	 * (Can set to `png` or `jpg`) */
	OUTPUT_IMAGE_FORMAT: 'png',
	/** A state indicating whether the user wants to
	 * automate the image editing process or
	 * have a breakpoint for each one. */
	SKIP_DIALOG: false,
};

// ! Cli stuff
/** Cli interface */
const cli = readline.createInterface({
	terminal: true,
	input: process.stdin,
	output: process.stdout,
});

/** Cli question */
const cliQuestion = (question: string) => new Promise<string>((res) => cli.question(`${question} `, res));

/** Cli question with `fixed answers`
 * (The loop is activated if the user
 *  writes an incorrect answer) */
const cliFixedQuestion = async (question: string, answers: string[]) => {
	const validAnswerString = answers.toString().replaceAll(',', ' | ');
	do {
		const userAnswer = await cliQuestion(`${question} [${validAnswerString}]`);
		if (answers.find((answer) => answer === userAnswer)) return userAnswer;
		console.log('Invalid answer');
	} while (true);
};

/** Cli `dichotomous` question (Accepts only 2 answers, `yes` or `no`) */
const cliDichotomousQuestion = async (question: string) => ((await cliFixedQuestion(question, ['yes', 'no'])) === 'yes' ? true : false);

// ! Main app proccess
console.log('Booting...');
(async () => {
	const appActions = ['accinfo', 'proccess', 'exit'];
	enum AppActionIndex {
		AccountInfo,
		Proccess,
		Exit,
	}

	/** Ask user for next action */
	appActionLoop: do {
		const performAction = await cliFixedQuestion('Type the action you want to perform:', appActions);
		switch (performAction) {
			case appActions[AppActionIndex.AccountInfo]:
				await accoutInfo();
				break;

			case appActions[AppActionIndex.Proccess]:
				await imageProccess();
				break;

			case appActions[AppActionIndex.Exit]:
				break appActionLoop;
		}
	} while (true);

	console.log('Exiting app...');
	proccess.exit();
})();

/** Request's users account info by `api key` */
async function accoutInfo() {
	accountInfoLoop: do {
		const providedApiKey = await cliQuestion(`Account api key:`);
		console.log(`Starting request for account information with the api key ${providedApiKey}`);

		// Send a request to the removebg to get the account info
		const response = await fetch('https://api.remove.bg/v1.0/account', {
			method: 'GET',
			headers: {
				'X-API-Key': providedApiKey,
			},
		});

		switch (response.status) {
			// Success
			case 200: {
				const { attributes } = JSON.parse(await response.text()).data;
				console.log(`\nAccount Info`);
				console.log(` • Total credits left: ${attributes.credits.total}`);
				console.log(` • Api calls remaining: ${attributes.api.free_calls}\n`);
				break accountInfoLoop;
			}

			// Authentication failed
			case 403: {
				console.log('It seems that the provided api key is invalid');
				const userAnswer = await cliDichotomousQuestion('Try with other api key?');
				if (!userAnswer) break accountInfoLoop;
				else break;
			}

			// Rate limit exceeded
			case 429: {
				console.log('Too many requests in a short amount of time');
				const unixRequestAvailable = Number(response.headers.get('X-RateLimit-Reset'));
				if (!unixRequestAvailable) {
					console.log(`Unexpected error occurred on the \`next request available in x seconds \`. Restarting account info request`);
					continue;
				}

				/** Get the time difference from the next available request in seconds */
				const secondDif = () => Math.floor((new Date().getTime() - unixRequestAvailable) / 1000);
				const waitForTimeout = await cliDichotomousQuestion(`Try again in ${secondDif()} seconds?`);
				if (waitForTimeout) {
					console.log(`In ${secondDif()} seconds next request will be sended`);
					await new Promise((res) => setTimeout(res, (secondDif() + 1) * 1000));
				} else break accountInfoLoop;
			}

			// Unexpected error
			default:
				console.log('Something went wrong. Please try again later');
				break accountInfoLoop;
		}
	} while (true);
}

/** Proccess all images in a direction to the required reesult */
async function imageProccess() {
	// System directories
	const apiKeys = IMAGE_PROCCESS_DATA.API_KEYS.length > 0 ? IMAGE_PROCCESS_DATA.API_KEYS : (await cliQuestion('Api keys:')).split(' ');
	const inputImageDir = IMAGE_PROCCESS_DATA.INPUT_DIR ?? (await cliQuestion('Get images from directory:'));
	const outputImageDir = IMAGE_PROCCESS_DATA.OUTPUT_DIR ?? (await cliQuestion('Save images in directory:'));

	// A simple value validness checker
	if (apiKeys.length === 0 || !inputImageDir || !outputImageDir) return console.log('Unexpected input values! Exiting image proccess mode');
	const validImageExtensionsFilter = (imageName: string) => ['png', 'jpg', 'jpeg'].find((imageExt) => imageName.endsWith(imageExt));

	// Get and find the required for proccess images, from the provided directories above
	const inputImageNames = fs.readdirSync(inputImageDir).filter(validImageExtensionsFilter);
	const outputImageNames = fs.readdirSync(outputImageDir).filter(validImageExtensionsFilter);
	const uniqueImageNames = inputImageNames.filter(
		(inputImageName) =>
			!outputImageNames.find((outputImageName) => path.parse(inputImageName).name === path.parse(outputImageName).name) &&
			fs.statSync(path.join(inputImageDir, inputImageName)).isFile()
	);

	let mainApiKey = apiKeys[0]!;
	console.log(`Using api key: ${mainApiKey}`);
	console.log(`${uniqueImageNames.length} / ${inputImageNames.length} images will be proccessed`);

	/** The state of skipping all dialog processes.
	 * As long as 'true', no additional cli questions
	 *  will be displayed unless there is any problem. */
	let skipDialog = IMAGE_PROCCESS_DATA.SKIP_DIALOG ?? false;
	// Proccess each image
	for (let i = 0; i < uniqueImageNames.length; i++) {
		const imageBasename = uniqueImageNames[i]!;
		const imageName = path.parse(imageBasename).name;
		if (!skipDialog) {
			const validAnswers = ['yes', 'force', 'exit'];
			const answer = await cliFixedQuestion('Proccess next image?', validAnswers);
			switch (answer) {
				case 'force':
					skipDialog = true;
					break;
				case 'exit':
					console.log('Exiting image editing proccess');
					return;
			}
		}

		const inputImagePath = path.join(inputImageDir, imageBasename);
		const outputImageExtension = IMAGE_PROCCESS_DATA.OUTPUT_IMAGE_FORMAT;

		/** Body form */
		const formData = new FormData();
		formData.append('image_file', fs.createReadStream(inputImagePath));
		formData.append('format', outputImageExtension);
		formData.append('size', 'auto');
		if (IMAGE_PROCCESS_DATA.INPUT_BACKGROUND) formData.append('bg_image_file', fs.createReadStream(IMAGE_PROCCESS_DATA.INPUT_BACKGROUND));

		requestLoop: do {
			console.log(`Starting request for image with the name ${imageBasename} (${i + 1} / ${uniqueImageNames.length})`);
			// Request proccessed image from removebg serevers
			const response = await fetch('https://api.remove.bg/v1.0/removebg', {
				method: 'POST',
				headers: {
					'X-Api-Key': mainApiKey,
				},
				body: formData,
			});

			// Success
			if (response.status === 200) {
				const outputImageBasename = imageName + outputImageExtension;
				const outputImagePath = path.join(outputImageDir, outputImageBasename);
				const buffer = await response.buffer();
				try {
					fs.writeFileSync(outputImagePath, buffer);
					console.log(`Successfuly saved image with the name ${outputImageBasename}`);
				} catch (error) {
					console.log(`Could not save the image with the name ${outputImageBasename}\nContinuing to the next image`);
				}
				continue;
			}

			// Rate limit exceeded
			if (response.status === 429) {
				console.log('Too many requests in a short amount of time');
				const unixRequestAvailable = Number(response.headers.get('X-RateLimit-Reset'));
				if (!unixRequestAvailable) {
					console.log(`An unexpected error occurred on the \`next request available in x seconds \`. Skipping this image process`);
					continue;
				}

				/** Get the time difference from the next available request in seconds */
				const secondDif = () => Math.floor((new Date().getTime() - unixRequestAvailable) / 1000);
				const waitForTimeout = skipDialog || (await cliDichotomousQuestion(`Try again in ${secondDif()} seconds?`));
				if (waitForTimeout) {
					console.log(`In ${secondDif()} seconds next request wave will be started`);
					await new Promise((res) => setTimeout(res, (secondDif() + 1) * 1000));
				} else break requestLoop;
			}

			//  Insufficient credits
			if (response.status === 402) console.log(`Account with the api key \`${mainApiKey}\` has no more api calls`);
			// Authentication failed
			if (response.status === 403) console.log(`Authentication with the api key \`${mainApiKey}\` failed`);

			// Switch api key to the next one if it exists
			const nextApiKeyIndex = apiKeys.indexOf(mainApiKey) + 1;
			if (nextApiKeyIndex >= apiKeys.length) {
				console.log('There is no more available api keys which the app could switch on');
				break;
			} else {
				mainApiKey = apiKeys[nextApiKeyIndex]!;
				console.log(`Switching to next api key: ${mainApiKey}`);
			}
		} while (true);
	}
	console.log('Quiting image editing proccess');
}
