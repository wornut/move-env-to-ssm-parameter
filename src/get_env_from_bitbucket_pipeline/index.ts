/* eslint-disable @typescript-eslint/no-explicit-any */
import { question, argv, fetch } from 'zx';
import { RequestInit, Response } from 'node-fetch';
import { get, isEqual } from 'lodash-es';
import { log } from '../helper/logger';
import { from } from 'rxjs';

const BITBUCKET_BASE_URL = 'https://api.bitbucket.org/2.0';

type Query = {
    workspace: string;
    project_key: string; // slug
    repo_slug: string; // slug
    deployment_id: string;
};

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
    const headers = {
        Authorization: `Basic ${auth64}`,
        'Content-Type': 'application/json',
    };

    return (path: string, option: RequestInit) => fetch(BITBUCKET_BASE_URL + path, { headers, ...option });
}

function waitResponse<T>(req: Promise<Response>): Promise<T> {
    return req.then((res) => res.json()) as unknown as Promise<T>;
}

async function selectWorkspace(client: ReturnType<typeof bbclient>) {
    const { values } = await waitResponse<{
        values: {
            slug: string;
        }[];
    }>(client('/workspaces?fields=values.slug', { method: 'GET' }));

    return question('Select a workspace (press TAB for hint): ', {
        choices: Array.from(values).map((v) => get(v, 'slug', '-')),
    });
}

async function selectProject(client: ReturnType<typeof bbclient>, query: Pick<Query, 'workspace'>) {
    const { values } = await waitResponse<{
        values: {
            key: string;
            uuid: string;
        }[];
    }>(client(`/workspaces/${query.workspace}/projects?fields=values.key,values.uuid`, { method: 'GET' }));

    const key = await question('Select a project (press TAB for hint): ', {
        choices: Array.from(values).map((v) => get(v, 'key', '-')),
    });

    const matchKey = values.find((item) => isEqual(key, item.key));

    return get(matchKey, 'uuid', '');
}

type GetRepoResult = {
    next?: string;
    size: number;
    values: {
        uuid: string;
        slug: string;
    }[];
};

async function* getRepoGenerator(client: ReturnType<typeof bbclient>, url: string): AsyncGenerator<GetRepoResult> {
    let result = await waitResponse<GetRepoResult>(client(url, { method: 'GET' }));
    yield result;

    while (result.next) {
        result = await waitResponse<GetRepoResult>(
            client(result.next.replace(BITBUCKET_BASE_URL, ''), { method: 'GET' }),
        );
        yield result;
    }
}

async function queryAllRepoGenerator(
    client: ReturnType<typeof bbclient>,
    query: Pick<Query, 'workspace' | 'project_key'>,
) {
    const q = encodeURI(`project.key="${query.project_key}"`);
    const url = `/repositories/${query.workspace}?q=${q}&fields=values.slug,values.uuid,next`;

    // fetch repo util next url is null
    from(getRepoGenerator(client, url)).subscribe({
        next: (result) => {
            log([JSON.stringify(result.values, null, 2)]);
        },
    });
}

export async function getEnvFromBitbucketPipelineVariable() {
    const { username, apptoken, workspace: argvWorkspace, project: argvProject } = await parseCliParameters();

    const client = bbclient(username, apptoken);
    const workspace = argvWorkspace ?? (await selectWorkspace(client));
    const project = argvProject ?? (await selectProject(client, workspace));

    await queryAllRepoGenerator(client, { workspace, project_key: project });
}
