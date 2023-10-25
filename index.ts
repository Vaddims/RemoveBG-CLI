import proccess from 'process';
import readline from 'readline';
import fetch from 'node-fetch';
import FormData from 'form-data';
import path from 'path';
import fs from 'fs';
import rawConfig from './config.json';

interface ImageProcessConfig {
	readonly apiKeys: string[];
	readonly inputDir: string | null;
	readonly outputDir: string | null;
	readonly background?: string | null;
	readonly outputImageFormat: 'png' | 'jpg' | 'jpeg';
	readonly skipDialogs: boolean;
}

const config = rawConfig as ImageProcessConfig;

class Cli {
	public interface = readline.createInterface({
		terminal: true,
		input: process.stdin,
		output: process.stdout,
	})

	public question(question: string) {
		const rlinterface = this.interface;
		return new Promise<string>((res) => rlinterface.question(`${question} `, res))
	}

	public async fixedQuestion(question: string, answers: string[]) {
		const validAnswerString = answers.toString().replaceAll(',', ' | ');
		do {
			const userAnswer = await this.question(`${question} [${validAnswerString}]`);
			if (answers.find((answer) => answer === userAnswer)) {
				return userAnswer;
			}

			console.log('Invalid answer');
		} while (true);
	}

	public async dichotomousQuestion(question: string) {
		return await(this.fixedQuestion(question, ['y', 'n'])) === 'y' ? true : false
	}
}

const cli = new Cli();

enum ResponseStatus {
	Success = 200,
	PaymentRequired = 402,
	Forbidden = 403,
	RateLimitExceeded = 429,
}

(async () => {
	const appActions = ['accinfo', 'process', 'exit'];
	enum AppActionIndex {
		AccountInfo,
		Process,
		Exit,
	}

	let userRequestedAction;
	do {
		userRequestedAction = await cli.fixedQuestion('Type the action you want to perform:', appActions);

		switch (userRequestedAction) {
			case appActions[AppActionIndex.AccountInfo]:
				await displayAccoutInfo();
				break;

			case appActions[AppActionIndex.Process]:
				await imageProcess();
				break;
		}
	} while (userRequestedAction !== appActions[AppActionIndex.Exit]);

	proccess.exit();
})();

async function displayAccoutInfo() {
	accountInfoLoop: do {
		const providedApiKey = await cli.question(`Account api key:`);
		console.log(`Starting request for account information with the api key ${providedApiKey}`);

		// Send a request to the removebg to get the account info
		const response = await fetch('https://api.remove.bg/v1.0/account', {
			method: 'GET',
			headers: {
				'X-API-Key': providedApiKey,
			},
		});

		switch (response.status) {
			case ResponseStatus.Success: {
				const { attributes } = JSON.parse(await response.text()).data;
				console.log(`\nAccount Info`);
				console.log(` • Total credits left: ${attributes.credits.total}`);
				console.log(` • Api calls remaining: ${attributes.api.free_calls}\n`);
				break accountInfoLoop;
			}

			case ResponseStatus.Forbidden: {
				console.log('It seems that the provided api key is invalid');
				const userAnswer = await cli.dichotomousQuestion('Try with other api key?');
				if (!userAnswer) {
					break accountInfoLoop;
				} else {
					break;
				}
			}

			case ResponseStatus.RateLimitExceeded: {
				console.log('Too many requests in a short amount of time');
				const unixRequestAvailable = Number(response.headers.get('X-RateLimit-Reset'));
				if (!unixRequestAvailable) {
					console.log(`Unexpected error occurred on the \`next request available in x seconds \`. Restarting account info request`);
					continue;
				}

				const secondDif = () => Math.floor((new Date().getTime() - unixRequestAvailable) / 1000);
				const waitForTimeout = await cli.dichotomousQuestion(`Try again in ${secondDif()} seconds?`);
				if (waitForTimeout) {
					console.log(`In ${secondDif()} seconds next request will be sended`);
					await new Promise((res) => setTimeout(res, (secondDif() + 1) * 1000));
				} else {
					break accountInfoLoop;
				}
			}

			default:
				console.log('Something went wrong. Please try again later');
				break accountInfoLoop;
		}
	} while (true);
}

async function imageProcess() {
	const apiKeys = config.apiKeys.length > 0 ? config.apiKeys : (await cli.question('Api keys:')).split(' ');
	const inputImageDir = config.inputDir ?? (await cli.question('Get images from directory:'));
	const outputImageDir = config.outputDir ?? (await cli.question('Save images in directory:'));

	if (apiKeys.length === 0 || !inputImageDir || !outputImageDir) {
		return console.log('Unexpected input values! Exiting image proccess mode');
	}

	const imageFormatIsValid = (imageName: string) => ['png', 'jpg', 'jpeg'].find((imageExt) => imageName.endsWith(imageExt));

	const inputDirImageNames = fs.readdirSync(inputImageDir).filter(imageFormatIsValid);
	const outputDirImageNames = fs.readdirSync(outputImageDir).filter(imageFormatIsValid);

	const notOutputedImageNames = inputDirImageNames.filter((inputDirImageName) => {
		const inputImageIsFile = fs.statSync(path.join(inputImageDir, inputDirImageName)).isFile();
		if (!inputImageIsFile) {
			return false;
		}

		const outputDirHasIdenticalImageName = outputDirImageNames.find(
			(outputDirImageName) => path.parse(outputDirImageName).name === path.parse(inputDirImageName).name
		);

		return !outputDirHasIdenticalImageName;
	});

	let mainApiKey = apiKeys[0]!;
	console.log(`Using api key: ${mainApiKey}`);
	console.log(`${notOutputedImageNames.length} out of ${inputDirImageNames.length} images will be processed`);

	let skipCliDialogs = config.skipDialogs ?? false;

	imageProcessLoop: for (let i = 0; i < notOutputedImageNames.length; i++) {
		const imageBasename = notOutputedImageNames[i]!;
		const imageName = path.parse(imageBasename).name;

		if (!skipCliDialogs) {
			const validAnswers = ['y', 'force', 'exit'];
			const answer = await cli.fixedQuestion('Process next image?', validAnswers);

			switch (answer) {
				case 'force':
					skipCliDialogs = true;
					break;
				case 'exit':
					console.log('Exiting image editing process');
					return;
			}
		}

		const inputImagePath = path.join(inputImageDir, imageBasename);
		const outputImageExtension = config.outputImageFormat;

		const formData = new FormData();
		formData.append('image_file', fs.createReadStream(inputImagePath));
		formData.append('format', outputImageExtension);
		formData.append('size', 'auto');
		if (config.background) {
			formData.append('bg_image_file', fs.createReadStream(config.background))
		};

		requestLoop: do {
			console.log(`Starting request for "${imageBasename}" (${i + 1} / ${notOutputedImageNames.length})`);
			const response = await fetch('https://api.remove.bg/v1.0/removebg', {
				method: 'POST',
				headers: {
					'X-Api-Key': mainApiKey,
				},
				body: formData,
			});

			switch (response.status) {
				case ResponseStatus.Success: {
					const outputImageBasename = `${imageName}` + outputImageExtension;
					const outputImagePath = path.join(outputImageDir, outputImageBasename);
					const buffer = await response.buffer();
					try {
						fs.writeFileSync(outputImagePath, buffer);
						console.log(`Successfuly saved image with the name ${outputImageBasename}`);
					} catch (error) {
						console.log(`Could not save the image with the name ${outputImageBasename}\nContinuing to the next image`);
					}
					
					continue imageProcessLoop;
				}

				case ResponseStatus.PaymentRequired: {
					console.log(`Account with the api key \`${mainApiKey}\` has no more api calls`)
					break;
				}

				case ResponseStatus.Forbidden: {
					console.log(`Authentication with the api key \`${mainApiKey}\` failed`);
					break;
				}

				case ResponseStatus.RateLimitExceeded: {
					console.log('Too many requests in a short amount of time');
					const unixRequestAvailable = Number(response.headers.get('X-RateLimit-Reset'));
					if (!unixRequestAvailable) {
						console.log(`An unexpected error occurred on the \`next request available in x seconds \`. Skipping this image process`);
						continue imageProcessLoop;
					}
	
					const secondDifference = () => Math.floor((new Date().getTime() - unixRequestAvailable) / 1000);
					const waitForTimeout = skipCliDialogs || (await cli.dichotomousQuestion(`Try again in ${secondDifference()} seconds?`));

					if (waitForTimeout) {
						console.log(`Next image process request will be started in ${secondDifference()} seconds`);
						await new Promise((res) => setTimeout(res, (secondDifference() + 1) * 1000));
					} else {
						break requestLoop
					};
				}
			}

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
