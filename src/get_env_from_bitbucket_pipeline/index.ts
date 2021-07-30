/* eslint-disable @typescript-eslint/no-explicit-any */
import { question, argv, fetch } from 'zx';
import { RequestInit, Response } from 'node-fetch';
import { get, isEqual } from 'lodash-es';
import { log } from '../helper/logger';

async function parseCliParameters() {
    const username: string = argv['username'] ?? (await question('Bitbucket username: '));
    const apptoken: string = argv['apptoken'] ?? (await question('Bitbucket apptoken: '));
    const workspace = argv['w'] || argv['workspace'];
    const project = argv['p'] || argv['project'];

    return {
        username,
        apptoken,
        workspace,
        project,
    };
}

function bbclient(username: string, apptoken: string) {
    const auth64 = Buffer.from([username, apptoken].join(':')).toString('base64');
    const baseUrl = 'https://api.bitbucket.org/2.0';
    const headers = {
        Authorization: `Basic ${auth64}`,
        'Content-Type': 'application/json',
    };

    return (path: string, option: RequestInit) => fetch(baseUrl + path, { headers, ...option });
}

function waitResponse(res: Response) {
    return res.json();
}

async function selectWorkspace(client: ReturnType<typeof bbclient>) {
    const { values: workspaceValues } = await client('/workspaces?fields=values.slug', { method: 'GET' }).then(
        waitResponse,
    );

    return question('Select a workspace (press TAB for hint): ', {
        choices: Array.from(workspaceValues).map((v) => get(v, 'slug', '-')),
    });
}

async function selectProject(client: ReturnType<typeof bbclient>, workspace: string) {
    const { values: projectValues } = await client(`/workspaces/${workspace}/projects?fields=values.key,values.uuid`, {
        method: 'GET',
    }).then(waitResponse);

    const key = await question('Select a project (press TAB for hint): ', {
        choices: Array.from(projectValues).map((v) => get(v, 'key', '-')),
    });

    const matchKey = projectValues.find((item: any) => isEqual(key, item.key));

    return get(matchKey, 'uuid', '');
}

async function getAllRepoSlug(client: ReturnType<typeof bbclient>, query: { workspace: string; project: string }) {
    const { values: repoValues } = await client(
        `/repositories/${query.workspace}?fields=values.full_name,values.uuid`,
        {
            method: 'GET',
        },
    ).then(waitResponse);

    const repos = Array.from(repoValues).map((v) => get(v, 'full_name', '-'));

    log(repos);
}

export async function getEnvFromBitbucketPipelineVariable() {
    const { username, apptoken, workspace: argvWorkspace, project: argvProject } = await parseCliParameters();

    const client = bbclient(username, apptoken);
    const workspace = argvWorkspace ?? (await selectWorkspace(client));
    const project = argvProject ?? (await selectProject(client, workspace));
    await getAllRepoSlug(client, { workspace, project });
    // const { values } = await client('/workspaces?fields=values.slug', { method: 'GET' }).then(waitResponse);

    // log([workspace, project]);
}
