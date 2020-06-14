import '@babel/polyfill';
import { sleep } from 'sleep';
import fetch from 'node-fetch';

const getLoadBalancers = async (region = 'fr-par') => {
    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs`, {
        headers: { 'X-Auth-Token': process.env.TOKEN },
    }).then((res) => res.json());

    return data;
};

const getCertificates = async (lb, region = 'fr-par') => {
    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs/${lb}/certificates`, {
        headers: { 'X-Auth-Token': process.env.TOKEN },
    }).then((res) => res.json());

    return data;
};

const addCertificate = async (rootDomain, domains, lb, region = 'fr-par') => {
    const body = {
        name: 'cert01',
        letsencrypt: {
            common_name: rootDomain,
            subject_alternative_name: domains,
        },
    };

    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs/${lb}/certificates/`, {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'X-Auth-Token': process.env.TOKEN },
    }).then((res) => res.json());

    return data;
};

const getFrontends = async (lb, region = 'fr-par') => {
    const data = await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/lbs/${lb}/frontends`, {
        headers: { 'X-Auth-Token': process.env.TOKEN },
    }).then((res) => res.json());

    return data;
};

const updateFrontend = async (frontendId, backendId, certificateId, region = 'fr-par') => {
    const body = {
        name: 'https-443',
        inbound_port: '443',
        backend_id: backendId,
        certificate_id: certificateId,
    };

    await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/frontends/${frontendId}`, {
        body: JSON.stringify(body),
        method: 'PUT',
        headers: { 'X-Auth-Token': process.env.TOKEN },
    }).then((res) => res.json());
};

const removeCertificate = async (certificate, region = 'fr-par') => {
    await fetch(`https://api.scaleway.com/lb/v1/regions/${region}/certificates/${certificate}`, {
        method: 'DELETE',
        headers: { 'X-Auth-Token': process.env.TOKEN },
    });
};

export default async (rootDomain, newDomain) => {
    // Get Load balancers

    const loadBalancers = await getLoadBalancers();
    const loadBalancerId = loadBalancers.lbs[0].id;

    // // Get certificates

    const { certificates } = await getCertificates(loadBalancerId);
    const certificateId = certificates[0].id;

    const domains = certificates[0].subject_alternative_name;
    domains.push(newDomain);
    const newDomains = [...new Set(domains)];

    // // Add new certificate

    const newCertificate = await addCertificate(rootDomain, newDomains, loadBalancerId);
    const newCertificateId = newCertificate.id;

    // Get frontend list

    const { frontends } = await getFrontends(loadBalancerId);
    const frontendHTTPS = frontends.filter(({ name }) => name === 'https-443');
    const frontendHTTPSId = frontendHTTPS[0].id;
    const backendHTTPSId = frontendHTTPS[0].backend.id;

    // Update frontend

    sleep(30);
    await updateFrontend(frontendHTTPSId, backendHTTPSId, newCertificateId);

    // Remove old certificate

    await removeCertificate(certificateId);
};
