import {z} from "zod";

export default function apiBasedTools(server) {
    const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3000";
    async function makeRequest(method,url, data=null,options={})
    {
        const config = {
            method,
            headers:{
                "content-Type":"appliaction/json",
                ...options.headers
            }
        };
        if(data)
        {
            config.body = JSON.stringify(data);
        }
        try {
            const response = await fetch(url,config);
            const result = await response.json();

            let jsonResult;
            try{
                jsonResult = JSON.parse(result);
            } catch() {
                jsonResult = result;
            }

        }
    }
    
}
