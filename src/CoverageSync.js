const { join } = require('path');
const { promisify } = require('util');
const got = require('got');
const readdirp = require('readdirp');
const { eachLine } = require('line-reader');

const eachLineAsync = promisify(eachLine);

const questionRegex = /^([#]*\s|(title)[:]\s)(What|How|When|Where|Why|Who|By whom).*/gm;

class File {
  constructor(filename, fullpath) {
    this.filename = filename;
    this.fullpath = fullpath;
    this.lines = [];
  }

  fileString() {
    return `${this.lines.join("\n")}\n`;
  }
}

class Question {
  constructor(question, fullpath) {
    this.text = question;
    this.fullpath = fullpath;
  }
}

class CoverageSync {
  constructor(notionKey, notionDatabaseID, logger) {
    this.notionKey = notionKey;
    this.notionDatabaseID= notionDatabaseID;
    this.logger = logger;
    this.targets = ['docs/'];
  }

  async run() {
    const notionPages = await this.getQuestionsFromNotion();
    // console.log(notionPages);
    const docPages = await this.getQuestionsFromDocs();
    const docQuestions = await this.extractQuestions(docPages);
    await this.syncQuestions(notionPages, docQuestions);
    // await this.testPageCreation();
    // await this.testPageUpdate();
    // convertToURL('xxxx');
  }

  async getQuestionsFromNotion() {
    const notionPages = [];
    let hasMore = true;
    let cursor = undefined;
    while (hasMore) {
      console.log("dialing Notion...");
      const payload = {
        start_cursor: cursor,
        filter: {
          or: [
            {
              property: 'Type',
              multi_select: {
                contains: 'Question',
              },
            },
          ],
        }
      };
      let options = {
        headers: {
          Authorization: `Bearer ${this.notionKey}`,
        },
        responseType: 'json',
        json: payload,
      }
      console.log("OPTIONS");
      console.log(options);
      const { body } = await got.post(
        `https://api.notion.com/v1/databases/${this.notionDatabaseID}/query`,
        options
      );
      console.log("RESPONSE");
      console.log(body.has_more);
      console.log(body.next_cursor);
      console.log(body.results.length);
      hasMore = body.has_more;
      cursor = body.next_cursor;
      if (body.results.length > 0) {
        notionPages.push(...body.results);
      }
    }
    console.log("pages retrieved...");
    return notionPages;
  }

  async getQuestionsFromDocs() {
    let docPages = await this.getTargetFilesInfos();
    docPages = await this.getTargetFilesLines(docPages);
    return docPages;
  }

  async getTargetFilesInfos() {
    const docPages = [];
    for (const target of this.targets) {
      const targetDirPath = join('/Users/cullywakelin/Temporal/documentation', target);
      for await (const entry of readdirp(targetDirPath)) {
        const page = new File(entry.basename, entry.fullPath);
        docPages.push(page);
      }
    }
    return docPages;
  }
  // getTargetFilesLines loops through the files and calls readLines on each one
  async getTargetFilesLines(targetFiles) {
    const updatedFiles = [];
    for (let targetFile of targetFiles) {
      updatedFiles.push(await this.readLines(targetFile));

    }
    return updatedFiles;
  }
  // readLines reads each line of the file
  async readLines(targetFile) {
    const fileLines = [];
    await eachLineAsync(targetFile.fullpath, (line) => {
      fileLines.push(line);
    });
    targetFile.lines = fileLines;
    return targetFile;
  }

  async extractQuestions(docPages) {
    const questions = [];
    for (const page of docPages) {
      for (const line of page.lines) {
        const matches = line.match(questionRegex);
        if (matches != null ) {
          const text = matches[0];
          const words = text.split(' ');
          const question = new Question(words.slice(1, words.length).join(' '), page.fullpath);
          questions.push(question);
        }
      }
    }
    return questions;
  }

  // async mapQuestions(notionPages, docQuestions) {
  //   const mappings = [];
  //   let missing = [];
  //   for (const page of notionPages) {
  //     console.log("Matching for " + page.properties.Name.title[0].plain_text);
  //     let mapping = {
  //       notionPage = page,
  //       dupDocQuestions = [],
  //     }
  //     for (const question of docQuestions) {
  //       if (question.text == page.properties.Name.title[0].plain_text) {
  //         console.log("match found");
  //         mapping.dupDocQuestions.push(question);
  //       }
  //     }
  //     if (mapping.dupDocQuestions.length == 0) {
  //       console.log("no match found");
  //       missing = addToMissing(missing, question);
  //     }
  //   }
  //   return {mappings: mappings, missing: missing};
  // }
  //
  // async syncQuestions (stuff) {
  //   for (mapping of stuff.mappings) {
  //     await this.updateNotionPage(mapping.notionPage.id, convertToURL(question.fullpath));
  //   }
  //
  //   for (question of stuff.missing)
  // }

  async syncQuestions(notionPages, docQuestions) {
    for (const question of docQuestions) {
      //console.log(question);
      let foundit = false;
      let tempPage = {};
      for (const page of notionPages) {
        if (question.text == page.properties.Name.title[0].plain_text) {
          //console.log(page.properties.Name.title[0].plain_text);
          foundit = true;
          tempPage = page;
          break;
        }
      }
      if(foundit) {
        console.log('Found one, updating...' + question.text);
        await this.updateNotionPage(tempPage.id, convertToURL(question.fullpath));
        const exists = 'Exists' in tempPage.properties;
        const link = 'Location' in tempPage.properties;
        //console.log(link);
        await this.updateNotionPage(tempPage.id, convertToURL(question.fullpath));
        // if ((exists != true) || (link != true)) {
        //   await this.updateNotionPage(tempPage.id, convertToURL(question.fullpath));
        //   //console.log('Fake update');
        // } else {
        //   console.log('Skipping because exists is set');
        // }
      } else {
        console.log('Not there, creating...' + question.text);
        await this.createNotionPage(question);
        //console.log('Fake creation')
      }
      await sleep(250);
    }
  }

  async testPageUpdate() {
    const id = '98a4d9c28bb7408c8e3084e7031afe17';
    const path = '/Users/cullywakelin/Temporal/documentation/docs/go/task-queues.md';
    await this.updateNotionPage(id, convertToURL(path));
  }

  async updateNotionPage(id, link) {
    const payload = {
      properties: {
        Exists: {
          select: {
            name: 'Exists',
          },
        },
        Location: {
          url: link,
        },
      },
    };
    //console.log(payload);
    const { body } = await got.patch(`https://api.notion.com/v1/pages/${id}`, {
      headers: {
        Authorization: `Bearer ${this.notionKey}`,
      },
      responseType: 'json',
      json: payload,
    });
    //console.log('Notion page updated');
  }

  async testPageCreation() {
    const text = 'This is a test question!!!!';
    const fullpath = '/Users/cullywakelin/Temporal/documentation/docs/go/task-queues.md';
    const question = new Question(text, fullpath);
    await this.createNotionPage(question);
  }

  async createNotionPage(question) {
    const payload = {
      parent: {
        database_id: this.notionDatabaseID,
      },
      properties: {
        Exists: { name: 'Exists' },
        Type: [
          { name: 'Question'},
        ],
        Location: convertToURL(question.fullpath),
        title: [{ text: { content: question.text } }],
      },
    };
    //console.log(payload);
    await got.post('https://api.notion.com/v1/pages', {
      headers: {
        Authorization: `Bearer ${this.notionKey}`,
      },
      responseType: 'json',
      json: payload,
    });
    //console.log('Notion page created');
  }
}

function convertPathsToBody() {

}

function addToMissing(missing, question) {
  if (notAlreadyMissing(missing, question)) {
    console.log("found new missing question");
    missing.push(question);
  }
  return;
}

function notAlreadyMissing(missing, question) {
  for (missed in missing) {
    if (missed.text == question.text) {
      return false;
    }
  }
  return true;
}

function convertToURL(path) {
  const parts = path.split('/');
  let url = [
    "https://docs.temporal.io",
    ...parts.slice(5, parts.length),
  ].join('/');
  url = url.substring(0, url.length - 3);
  return url;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { CoverageSync };



// {
//   "responseType": "json",
//   "json": {
//     "filter": {
//       "or": [
        // {
        //   "property": "Type",
        //   "multi_select": {
        //     "contains": "Question",
        //   }
        // }
//       ]
//     }
//   }
// }
//
// curl \
//   -H "Authorization: Bearer xxxx" \
//   -H 'Content-Type: application/json' \
//   -X POST "https://api.notion.com/v1/databases/xxxx/query" \
//   -d '{"responseType":"json","start_cursor":"xxxx","json":{"filter":{"or":[{"property":"Type","multi_select":{"contains":"Question"}}]}}}'


// curl -X POST 'https://api.notion.com/v1/databases/xxx/query' \
//   -H 'Authorization: Bearer '"xxxxxx"'' \
//   -H 'Notion-Version: 2021-08-16' \
//   -H "Content-Type: application/json" \
// 	--data '{"start_cursor":"xxxxx","filter":{ "or":[{"property": "Type","multi_select": {"contains": "Question"}}]}}'
